import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { parse } from '@vue/compiler-sfc';
import type { SFCDescriptor } from '@vue/compiler-sfc';
import type { WebContents } from 'electron';
import type { MigrationSkillId } from '../../../shared/migration-skills.js';
import {
  effectiveMigrationSkill,
  getSkillFragments,
  isVuexStoreSkill,
  normalizeSkillId,
} from '../../../shared/migration-skills.js';
import { getProjectById } from '../project-store.js';
import { loadConfig } from '../config-manager.js';
import {
  nextStatusAfterSuccess,
  resolveRoundType,
} from './state-machine.js';
import {
  parseVueSfcFromDisk,
  buildTemplateStepPrompt,
  buildScriptStepPrompt,
  buildStyleStepPrompt,
  buildAssemblyPrompt,
  buildVuexWholeFilePrompt,
  buildRefactorPrompt,
  extractFirstFence,
  extractTsxAndCssFromResponse,
} from './prompt-builder.js';
import { completePrompt } from './ai-provider.js';
import { runMechanicalDraft } from './mechanical-runner.js';
import { mergeAssistantContexts, readProjectCoderebuilderContext } from './project-context.js';
import { writeHistorySnapshots } from './version-writer.js';
import * as taskLock from './task-lock-manager.js';
import { getFileStatus, updateFileStatus } from '../storage/refactor-file-status-repo.js';
import {
  getVersionByNo,
  getLatestSucceededVersion,
  insertVersion,
} from '../storage/refactor-versions-repo.js';

export async function runRefactorTask(options: {
  projectId: string;
  sourceFilePath: string;
  appendPrompt?: string;
  baseVersionNo?: number;
  /** 迁移脚本 / 技能：影响分步 Prompt 模板 */
  migrationSkillId?: MigrationSkillId | string | null;
  taskId: string;
  webContents: WebContents;
}): Promise<void> {
  const project = getProjectById(options.projectId);
  if (!project) {
    const r = getFileStatus(options.projectId, options.sourceFilePath);
    if (r) {
      updateFileStatus(options.projectId, options.sourceFilePath, {
        current_status: 'failed',
        last_error: 'Project not found',
      });
    }
    taskLock.release(options.projectId, options.sourceFilePath, options.taskId);
    return;
  }
  const projectRoot = project.root_path;
  const row = getFileStatus(options.projectId, options.sourceFilePath);
  if (!row) {
    taskLock.release(options.projectId, options.sourceFilePath, options.taskId);
    return;
  }

  const sendProgress = (phase: string, message?: string): void => {
    options.webContents.send('refactor:task-progress', {
      taskId: options.taskId,
      projectId: options.projectId,
      sourceFilePath: options.sourceFilePath,
      phase,
      message,
    });
  };

  const sendUpdated = (): void => {
    const latest = getFileStatus(options.projectId, options.sourceFilePath);
    options.webContents.send('refactor:file-status-updated', {
      projectId: options.projectId,
      sourceFilePath: options.sourceFilePath,
      status: latest!.current_status,
      confirmedVersionNo: latest!.confirmed_version_no,
    });
  };

  const failVersion = (
    fullPrompt: string,
    round: 'initial' | 're_refactor',
    err: string
  ): void => {
    const cur = getFileStatus(options.projectId, options.sourceFilePath)!;
    const nextNo = cur.latest_version_no + 1;
    const failDir = writeHistorySnapshots(
      projectRoot,
      options.sourceFilePath,
      nextNo,
      readFileSync(join(projectRoot, options.sourceFilePath), 'utf-8'),
      `// failed\n`,
      `/* failed */\n`
    );
    insertVersion({
      project_id: options.projectId,
      file_status_id: cur.id,
      version_no: nextNo,
      round_type: round,
      source_snapshot_path: failDir.sourceRel,
      generated_snapshot_path: failDir.generatedTsxRel,
      prompt_full_text: fullPrompt || `FAILURE\n${err}`,
      prompt_append_text: options.appendPrompt ?? null,
      model_provider: 'n/a',
      model_name: 'n/a',
      token_input: null,
      token_output: null,
      generation_status: 'failed',
      failure_reason: err,
      created_at: new Date().toISOString(),
    });
    updateFileStatus(options.projectId, options.sourceFilePath, {
      latest_version_no: nextNo,
      current_status: 'failed',
      last_error: err,
    });
    sendUpdated();
    options.webContents.send('refactor:error', {
      projectId: options.projectId,
      sourceFilePath: options.sourceFilePath,
      message: err,
    });
  };

  try {
    sendProgress('parse', 'Reading source file');
    const abs = join(projectRoot, options.sourceFilePath);
    const sourceText = readFileSync(abs, 'utf-8');

    const appCfg = loadConfig();
    const projectContextMerged = mergeAssistantContexts(
      appCfg.refactorAssistant?.contextMarkdown,
      readProjectCoderebuilderContext(projectRoot)
    );

    let mechanicalDraftText: string | undefined;
    let mechanicalDraftLabel: string | undefined;
    const mechanicalCfg = appCfg.refactorAssistant?.mechanicalDraft;
    if (
      mechanicalCfg?.enabled &&
      mechanicalCfg.preset !== 'none' &&
      /\.vue$/i.test(options.sourceFilePath)
    ) {
      sendProgress(
        'parse',
        `Running mechanical Vue→React tool (${mechanicalCfg.preset === 'vue_to_react_vtr' ? 'vue-to-react vtr' : mechanicalCfg.preset})…`
      );
      const mc = await runMechanicalDraft({
        projectRoot,
        sourceRel: options.sourceFilePath,
        cfg: mechanicalCfg,
      });
      if (mc?.ok === false) {
        sendProgress(
          'parse',
          `Mechanical tool failed (${mc.label}): ${mc.error.slice(0, 220)} … continue with LLM-only`
        );
      } else if (mc?.ok === true) {
        mechanicalDraftText = mc.text;
        mechanicalDraftLabel = mc.label;
        sendProgress('parse', `Mechanical draft ready (${mc.label}); LLM will refine`);
      }
    }
    const skill = effectiveMigrationSkill(
      normalizeSkillId(options.migrationSkillId == null ? '' : String(options.migrationSkillId)),
      options.sourceFilePath
    );
    const fragments = getSkillFragments(skill);

    const hasConfirmed = (row.confirmed_version_no ?? 0) > 0;
    const round = resolveRoundType(row.current_status, options.appendPrompt, hasConfirmed);

    let previousReact: string | undefined;
    if (round === 're_refactor') {
      if (options.baseVersionNo != null) {
        const v = getVersionByNo(row.id, options.baseVersionNo);
        if (v?.generation_status === 'succeeded') {
          try {
            previousReact = readFileSync(join(projectRoot, v.generated_snapshot_path), 'utf-8');
          } catch {
            previousReact = undefined;
          }
        }
      }
      if (!previousReact) {
        const latest = getLatestSucceededVersion(row.id);
        if (latest) {
          try {
            previousReact = readFileSync(join(projectRoot, latest.generated_snapshot_path), 'utf-8');
          } catch {
            previousReact = undefined;
          }
        }
      }
    }

    /** 四步流水线：① template JSX ② script/hooks ③ style ④ 拼装成品 */
    const runFourStepSfcMigration = async (
      descriptor: SFCDescriptor,
      openerMessage: string
    ): Promise<{
      ok: boolean;
      aiTextFinal?: string;
      promptArchive?: string;
      sumIn?: number;
      sumOut?: number;
    }> => {
      sendProgress('parse', openerMessage);

      let arch = '';
      let sin = 0;
      let sout = 0;

      const blocks = parseVueSfcFromDisk(
        projectRoot,
        options.sourceFilePath,
        descriptor
      );

      const pTpl = buildTemplateStepPrompt({
        sourceRel: options.sourceFilePath,
        fragments,
        templateHtml: blocks.template,
        appendPrompt: options.appendPrompt,
        projectContext: projectContextMerged,
        mechanicalDraftText,
        mechanicalDraftLabel,
      });
      arch += `\n\n=== STEP TEMPLATE ===\n${pTpl}`;
      sendProgress('ai', 'LLM: template → JSX');

      try {
        const aiTpl = await completePrompt(pTpl, { step: 'pipeline_template' });
        sin += aiTpl.inputTokens ?? 0;
        sout += aiTpl.outputTokens ?? 0;
        let jsxInside = extractFirstFence(aiTpl.text, ['jsx', 'tsx']);
        if (!jsxInside.trim()) jsxInside = '<div className={styles.root} />';

        const pScr = buildScriptStepPrompt({
          sourceRel: options.sourceFilePath,
          fragments,
          vueScript: blocks.script,
          jsxPreview: jsxInside,
          appendPrompt: options.appendPrompt,
          previousReact,
          projectContext: projectContextMerged,
          mechanicalDraftText,
          mechanicalDraftLabel,
        });
        arch += `\n\n=== STEP SCRIPT ===\n${pScr}`;
        sendProgress('ai', 'LLM: script → hooks/logic');

        const aiScr = await completePrompt(pScr, { step: 'pipeline_script' });
        sin += aiScr.inputTokens ?? 0;
        sout += aiScr.outputTokens ?? 0;
        let scriptHooks = extractFirstFence(aiScr.text, ['tsx', 'typescript', 'jsx']);
        if (!scriptHooks.trim()) scriptHooks = '// hooks\n';

        const pSty = buildStyleStepPrompt({
          sourceRel: options.sourceFilePath,
          fragments,
          styleCss: blocks.styles,
          jsxPreview: jsxInside,
          appendPrompt: options.appendPrompt,
          projectContext: projectContextMerged,
          mechanicalDraftText,
          mechanicalDraftLabel,
        });
        arch += `\n\n=== STEP STYLE ===\n${pSty}`;
        sendProgress('ai', 'LLM: style → CSS Module');

        const aiSty = await completePrompt(pSty, { step: 'pipeline_style' });
        sin += aiSty.inputTokens ?? 0;
        sout += aiSty.outputTokens ?? 0;
        let cssPart = extractFirstFence(aiSty.text, ['css', 'scss']);
        if (!cssPart.trim()) cssPart = '/* migrated */\n';

        const pAsm = buildAssemblyPrompt({
          sourceRel: options.sourceFilePath,
          fragments,
          jsxInsideReturn: jsxInside,
          scriptHooks,
          cssModule: cssPart,
          appendPrompt: options.appendPrompt,
          previousReact,
          projectContext: projectContextMerged,
          mechanicalDraftText,
          mechanicalDraftLabel,
        });
        arch += `\n\n=== STEP ASSEMBLY ===\n${pAsm}`;
        sendProgress('ai', 'LLM: assembly → .tsx + .module.css');

        const aiAsm = await completePrompt(pAsm, { step: 'pipeline_assemble' });
        sin += aiAsm.inputTokens ?? 0;
        sout += aiAsm.outputTokens ?? 0;

        return {
          ok: true,
          aiTextFinal: aiAsm.text,
          promptArchive: arch,
          sumIn: sin,
          sumOut: sout,
        };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        failVersion(arch.trim() || openerMessage, round, msg);
        return { ok: false };
      }
    };

    /** 合并存档用完整 prompt 与各步 token */
    let promptArchive = '';
    let sumIn = 0;
    let sumOut = 0;

    /** 最终结果 */
    let aiTextFinal = '';

    /** ---- Vuex 整文件迁移（非 .vue） ---------------------------------- */
    if (isVuexStoreSkill(skill) && !/\.vue$/i.test(options.sourceFilePath)) {
      const fullPr = buildVuexWholeFilePrompt({
        sourceRel: options.sourceFilePath,
        fragments,
        rawSource: sourceText,
        appendPrompt: options.appendPrompt,
        previousReact,
        projectContext: projectContextMerged,
      });
      promptArchive = fullPr;
      sendProgress('ai', 'LLM: Vuex → store (single-shot)');
      let ai;
      try {
        ai = await completePrompt(fullPr, { step: 'vuex_whole' });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        failVersion(fullPr, round, msg);
        return;
      }
      aiTextFinal = ai.text;
      sumIn += ai.inputTokens ?? 0;
      sumOut += ai.outputTokens ?? 0;
    }
    /** ---- Vue SFC 分步流水线 ------------------------------------------ */
    else if (/\.vue$/i.test(options.sourceFilePath)) {
      sendProgress('parse', 'Parsing Vue SFC (@vue/compiler-sfc)');
      const vparsed = parse(sourceText, { filename: options.sourceFilePath });
      if (vparsed.errors?.length) {
        const msg = vparsed.errors.map((e) => e.message).join('; ');
        failVersion(`SFC parse errors:\n${msg}`, round, msg);
        return;
      }
      const piped = await runFourStepSfcMigration(
        vparsed.descriptor,
        'Parsing Vue SFC (@vue/compiler-sfc)'
      );
      if (!piped.ok) return;
      promptArchive = piped.promptArchive!;
      sumIn += piped.sumIn!;
      sumOut += piped.sumOut!;
      aiTextFinal = piped.aiTextFinal!;
    }
    /** ---- 其它后缀：单次大 Prompt -------------------------------------- */
    else {
      sendProgress('parse', 'Trying Vue SFC parse (fallback)');
      const parsed = parse(sourceText, { filename: options.sourceFilePath });
      if (parsed.errors?.length) {
        const fallback = `[Non-Vue parse] Use single-shot refactor; parse noise: ${parsed.errors.map((e) => e.message).join('; ')}`;
        const { full } = buildRefactorPrompt({
          projectRoot,
          sourceRel: options.sourceFilePath,
          appendPrompt: `${options.appendPrompt ?? ''}\n${fallback}`,
          previousReact,
          skill,
          projectContext: projectContextMerged,
          mechanicalDraftText,
          mechanicalDraftLabel,
        });
        promptArchive = full;
        sendProgress('ai', 'LLM: single-shot (fallback)');
        let ai;
        try {
          ai = await completePrompt(full, { step: 'single_shot_fallback' });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          failVersion(full, round, msg);
          return;
        }
        aiTextFinal = ai.text;
        sumIn += ai.inputTokens ?? 0;
        sumOut += ai.outputTokens ?? 0;
      } else {
        const piped2 = await runFourStepSfcMigration(
          parsed.descriptor!,
          'Non-.vue but SFC-parseable · same 4-step pipeline'
        );
        if (!piped2.ok) return;
        promptArchive = piped2.promptArchive!;
        sumIn += piped2.sumIn!;
        sumOut += piped2.sumOut!;
        aiTextFinal = piped2.aiTextFinal!;
      }
    }

    sendProgress('extract', 'Parsing model output');
    const { tsx, css } = extractTsxAndCssFromResponse(aiTextFinal);
    const curForVersion = getFileStatus(options.projectId, options.sourceFilePath)!;
    const nextVersion = curForVersion.latest_version_no + 1;
    sendProgress('write', 'Writing version snapshots');
    const snaps = writeHistorySnapshots(
      projectRoot,
      options.sourceFilePath,
      nextVersion,
      sourceText,
      tsx,
      css
    );

    const aiCfg = appCfg.ai;
    insertVersion({
      project_id: options.projectId,
      file_status_id: row.id,
      version_no: nextVersion,
      round_type: round,
      source_snapshot_path: snaps.sourceRel,
      generated_snapshot_path: snaps.generatedTsxRel,
      prompt_full_text: promptArchive.trim(),
      prompt_append_text: options.appendPrompt ?? null,
      model_provider: aiCfg.provider,
      model_name: aiCfg.model,
      token_input: sumIn || null,
      token_output: sumOut || null,
      generation_status: 'succeeded',
      failure_reason: null,
      created_at: new Date().toISOString(),
    });

    const doneStatus = nextStatusAfterSuccess(round);
    updateFileStatus(options.projectId, options.sourceFilePath, {
      latest_version_no: nextVersion,
      last_error: null,
      current_status: doneStatus,
    });
    sendUpdated();
    options.webContents.send('refactor:diff-ready', {
      projectId: options.projectId,
      sourceFilePath: options.sourceFilePath,
      versionNo: nextVersion,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const hasConfirmed = (row.confirmed_version_no ?? 0) > 0;
    const r = resolveRoundType(row.current_status, options.appendPrompt, hasConfirmed);
    failVersion(`UNHANDLED\n${msg}`, r, msg);
  } finally {
    taskLock.release(options.projectId, options.sourceFilePath, options.taskId);
  }
}

export function startRefactorTask(
  args: Omit<Parameters<typeof runRefactorTask>[0], 'taskId'> & { taskId?: string }
): string {
  const taskId = args.taskId ?? randomUUID();
  void runRefactorTask({ ...args, taskId });
  return taskId;
}
