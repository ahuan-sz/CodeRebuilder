import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from '@vue/compiler-sfc';
import type {
  MigrationSkillId,
  SkillPromptFragments,
} from '../../../shared/migration-skills.js';
import {
  effectiveMigrationSkill,
  getSkillFragments,
} from '../../../shared/migration-skills.js';

export type SfcTextBlocks = {
  template: string;
  script: string;
  styles: string;
  /** 原始整块（用于存档 / Vuex 单轮） */
  rawSource: string;
};

/** 从磁盘读取并解析 Vue SFC 文本块（供多步 Prompt 使用） */
export function parseVueSfcFromDisk(
  projectRoot: string,
  sourceRel: string,
  descriptor: NonNullable<ReturnType<typeof parse>['descriptor']>
): SfcTextBlocks {
  const abs = join(projectRoot, sourceRel);
  const rawSource = readFileSync(abs, 'utf-8');
  const template = descriptor.template?.content ?? '<!-- empty -->';
  const script =
    descriptor.script?.content ?? descriptor.scriptSetup?.content ?? '// empty script';
  const styles = (descriptor.styles ?? []).map((s) => s.content).join('\n\n');
  return { template, script, styles, rawSource };
}

/** 产物基名：去掉目录与常见扩展 */
function stemForArtifacts(rel: string): string {
  const base = rel.split(/[/\\]/).pop() ?? rel;
  return base.replace(/\.(vue|tsx?|jsx?|js|mjs|cjs)$/i, '') || 'artifact';
}

function skillHeader(fragments: SkillPromptFragments): string {
  return fragments.global.trim();
}

const MECHANICAL_DRAFT_MAX_CHARS = 32_000;

function projectContextBlock(projectContext?: string): string {
  if (!projectContext?.trim()) return '';
  return `Project / team conventions (settings、MCP 导出或仓库 .coderebuilder/context.md)：\n${projectContext.trim()}\n\n`;
}

function mechanicalDraftBlock(draft?: string, label?: string): string {
  if (!draft?.trim()) return '';
  let body = draft.trim();
  if (body.length > MECHANICAL_DRAFT_MAX_CHARS) {
    body = `${body.slice(0, MECHANICAL_DRAFT_MAX_CHARS)}\n\n...[truncated ${draft.length - MECHANICAL_DRAFT_MAX_CHARS} chars]`;
  }
  const who = label?.trim() || 'external tool';
  return `Mechanical converter draft (${who}) — 粗稿，需按本任务要求改写为 React FC + hooks + CSS Modules：\n\n\`\`\`tsx\n${body}\n\`\`\`\n\n`;
}

function promptPrefix(projectContext?: string, mechanicalDraftText?: string, mechanicalDraftLabel?: string): string {
  return `${projectContextBlock(projectContext)}${mechanicalDraftBlock(mechanicalDraftText, mechanicalDraftLabel)}`;
}

/** Step ① template → JSX（仅限 return 内层，由拼装阶段包住） */
export function buildTemplateStepPrompt(opts: {
  sourceRel: string;
  fragments: SkillPromptFragments;
  templateHtml: string;
  appendPrompt?: string;
  projectContext?: string;
  mechanicalDraftText?: string;
  mechanicalDraftLabel?: string;
}): string {
  const { sourceRel, fragments, templateHtml, appendPrompt } = opts;
  const extra = [appendPrompt ? `Additional user instructions:\n${appendPrompt}` : '']
    .filter(Boolean)
    .join('\n\n');

  return `${skillHeader(fragments)}

${promptPrefix(opts.projectContext, opts.mechanicalDraftText, opts.mechanicalDraftLabel)}TASK: STEP_TEMPLATE — Migrate ONLY the Vue <template> to JSX markup for React.

File: ${sourceRel}

Skill notes (template):
${fragments.template}

Vue <template>:
\`\`\`html
${templateHtml}
\`\`\`

${extra}

Output EXACTLY one fenced block:
\`\`\`jsx
{/* JSX fragment that belongs INSIDE return ( ... ); of a function component */}
\`\`\`

Rules:
- Use className={styles.xxx}; use styles object name \`${stemForArtifacts(sourceRel)}\` in comments only — real import happens at assembly.
- No import/export; no function wrapper around JSX.
`;
}

/** Step ② script → hooks / logic（不含外层组件壳） */
export function buildScriptStepPrompt(opts: {
  sourceRel: string;
  fragments: SkillPromptFragments;
  vueScript: string;
  jsxPreview: string;
  appendPrompt?: string;
  previousReact?: string;
  projectContext?: string;
  mechanicalDraftText?: string;
  mechanicalDraftLabel?: string;
}): string {
  const { sourceRel, fragments, vueScript, jsxPreview, appendPrompt, previousReact } = opts;
  const extra = [
    appendPrompt ? `Additional user instructions:\n${appendPrompt}` : '',
    previousReact ? `Previous React draft (reuse patterns / fix drift):\n\`\`\`tsx\n${previousReact}\n\`\`\`` : '',
  ]
    .filter(Boolean)
    .join('\n\n');

  return `${skillHeader(fragments)}

${promptPrefix(opts.projectContext, opts.mechanicalDraftText, opts.mechanicalDraftLabel)}TASK: STEP_SCRIPT — Convert Vue script to React hooks/helpers (TypeScript) that will compose with JSX from step ①.

File: ${sourceRel}

Skill notes (script):
${fragments.script}

Vue <script>:
\`\`\`ts
${vueScript}
\`\`\`

Upstream JSX snippet (already generated, adapt names/props MUST stay consistent):
\`\`\`jsx
${jsxPreview || '// (empty)'}
\`\`\`

${extra}

Output EXACTLY one fenced block — TypeScript BEFORE the JSX return wiring (hooks, helpers, typed props interface if needed):

\`\`\`tsx
// hooks, callbacks, memoized vals; export nothing; no JSX here
\`\`\`
`;
}

/** Step ③ styles → CSS Module */
export function buildStyleStepPrompt(opts: {
  sourceRel: string;
  fragments: SkillPromptFragments;
  styleCss: string;
  jsxPreview: string;
  appendPrompt?: string;
  projectContext?: string;
  mechanicalDraftText?: string;
  mechanicalDraftLabel?: string;
}): string {
  const stem = stemForArtifacts(opts.sourceRel);
  const extra = opts.appendPrompt
    ? `Additional user instructions:\n${opts.appendPrompt}`
    : '';

  return `${skillHeader(opts.fragments)}

${promptPrefix(opts.projectContext, opts.mechanicalDraftText, opts.mechanicalDraftLabel)}TASK: STEP_STYLE — Convert Vue <style> to CSS Modules for file ${stem}.module.css .

Skill notes (style):
${opts.fragments.style}

Reference JSX (keep class selectors aligned):
\`\`\`jsx
${opts.jsxPreview || '//'}
\`\`\`

Vue styles:
\`\`\`css
${opts.styleCss || '/* empty */'}
\`\`\`

${extra}

Output EXACTLY one fenced block:

\`\`\`css
/* module scope */
\`\`\`
`;
}

/** Step ④ 拼装最终 .tsx + 与占位说明（模型仍输出两围栏） */
export function buildAssemblyPrompt(opts: {
  sourceRel: string;
  fragments: SkillPromptFragments;
  jsxInsideReturn: string;
  scriptHooks: string;
  cssModule: string;
  appendPrompt?: string;
  previousReact?: string;
  projectContext?: string;
  mechanicalDraftText?: string;
  mechanicalDraftLabel?: string;
}): string {
  const stem = stemForArtifacts(opts.sourceRel);
  const ext = stem; // basename without .vue for import path suggestion
  const extra = [
    opts.appendPrompt ? `Additional user instructions:\n${opts.appendPrompt}` : '',
    opts.previousReact
      ? `Previous draft (prefer consistency unless contradicts new parts):\n\`\`\`tsx\n${opts.previousReact}\n\`\`\``
      : '',
  ]
    .filter(Boolean)
    .join('\n\n');

  const assemblyHint = opts.fragments.assembly.trim() || 'Merge parts into one default export FC.';

  return `${skillHeader(opts.fragments)}

${promptPrefix(opts.projectContext, opts.mechanicalDraftText, opts.mechanicalDraftLabel)}TASK: STEP_ASSEMBLY — Produce the final migration artifact.

Skill notes (assembly):
${assemblyHint}

Source file hint: ${opts.sourceRel}

--- Part A: JSX body (inside return) ---
\`\`\`jsx
${opts.jsxInsideReturn}
\`\`\`

--- Part B: hooks / helpers (prepend inside component body) ---
\`\`\`tsx
${opts.scriptHooks}
\`\`\`

--- Part C: CSS module ---
\`\`\`css
${opts.cssModule}
\`\`\`

${extra}

Output EXACTLY two fenced blocks:

1) \`\`\`tsx — full React file — default export function component named ${toPascalFromStem(ext)} .
   - Add: import React from 'react'; import styles from './${stem}.module.css'; (suffix fixed)
   - Compose Part B hooks then return ( Part A );
2) \`\`\`css — final ${stem}.module.css content matching Part A/B.

`;
}

function toPascalFromStem(stem: string): string {
  const parts = stem.split(/[/\\_-]+/).filter(Boolean);
  const pascal = parts
    .map((p) => p.replace(/[^\w]/g, ''))
    .map((p) => (p ? p.charAt(0).toUpperCase() + p.slice(1) : ''))
    .join('');
  return pascal || 'MigratedComponent';
}

/** Vuex / 整文件脚本：单轮迁移（仍为 tsx+css 两围栏便于写盘） */
export function buildVuexWholeFilePrompt(opts: {
  sourceRel: string;
  fragments: SkillPromptFragments;
  rawSource: string;
  appendPrompt?: string;
  previousReact?: string;
  projectContext?: string;
}): string {
  const stem = stemForArtifacts(opts.sourceRel);
  const baseName = stem || 'store';
  const extra = [
    opts.appendPrompt ? `Additional user instructions:\n${opts.appendPrompt}` : '',
    opts.previousReact
      ? `Previous output reference:\n\`\`\`tsx\n${opts.previousReact}\n\`\`\``
      : '',
  ]
    .filter(Boolean)
    .join('\n\n');

  return `${skillHeader(opts.fragments)}

${promptPrefix(opts.projectContext, undefined, undefined)}
${opts.fragments.script}

Source (${opts.sourceRel}):
\`\`\`typescript
${opts.rawSource}
\`\`\`

${extra}

Respond with EXACTLY two fenced blocks (no prose outside):
1) \`\`\`tsx — Redux Toolkit slice + exports OR Zustand store factory (per skill)；若仅需 .ts 逻辑，可把内容写在 ts 围栏并仍用 tsx fence 包住。
   若需提供最小 React Provider 占位，在同一文件末尾导出辅助组件。
   文件名语义：对齐 ${baseName}。
2) \`\`\`css — 最小 CSS Module（可为仅注释占位）供工具链写入 ${baseName}.module.css



Example delimiter:
\`\`\`tsx
// ...
\`\`\`

\`\`\`css
/* optional */
\`\`\`
`;
}

/** 兼容旧 callers：单层 giant prompt（单轮降级用） */
export function buildRefactorPrompt(options: {
  projectRoot: string;
  sourceRel: string;
  appendPrompt?: string;
  previousReact?: string;
  skill?: MigrationSkillId;
  projectContext?: string;
  mechanicalDraftText?: string;
  mechanicalDraftLabel?: string;
}): { full: string; blocks: { template: string; script: string; styles: string } } {
  const abs = join(options.projectRoot, options.sourceRel);
  const source = readFileSync(abs, 'utf-8');
  const { descriptor, errors } = parse(source, { filename: options.sourceRel });
  if (errors?.length) {
    void errors;
  }
  const template = descriptor.template?.content ?? '<!-- empty template -->';
  const script =
    descriptor.script?.content ?? descriptor.scriptSetup?.content ?? '// empty script';
  const styles = (descriptor.styles ?? []).map((s) => s.content).join('\n\n');
  const skill = effectiveMigrationSkill(options.skill ?? 'vue_sfc_default', options.sourceRel);
  const fragments = getSkillFragments(skill);

  const extra = [
    options.appendPrompt ? `User additional instructions:\n${options.appendPrompt}` : '',
    options.previousReact
      ? `Previous React draft:\n\`\`\`tsx\n${options.previousReact}\n\`\`\``
      : '',
  ]
    .filter(Boolean)
    .join('\n\n');

  const full = `${skillHeader(fragments)}

${promptPrefix(options.projectContext, options.mechanicalDraftText, options.mechanicalDraftLabel)}Source file: ${options.sourceRel}

Output requirements:
- Single default export in TypeScript (React FC when applicable).
- CSS Modules path: ./${stemForArtifacts(options.sourceRel)}.module.css

Vue <template>:
\`\`\`html
${template}
\`\`\`

Vue <script>:
\`\`\`ts
${script}
\`\`\`

Vue <style>:
\`\`\`css
${styles || '/* none */'}
\`\`\`

${extra}

Respond with EXACTLY two fenced blocks: tsx then css.

\`\`\`tsx
// ...
\`\`\`

\`\`\`css
/* ... */
\`\`\`
`;

  return { full, blocks: { template, script, styles } };
}

/** 按语言优先匹配第一个代码围栏正文 */
export function extractFirstFence(text: string, langPrefs: readonly string[]): string {
  const fence = /```(?:(tsx|typescript|jsx|css|scss)\s*)?\r?\n([\s\S]*?)```/gi;
  const blocks: { lang: string; body: string }[] = [];
  let m: RegExpExecArray | null;
  while ((m = fence.exec(text)) !== null) {
    const lang = (m[1] ?? '').toLowerCase();
    blocks.push({ lang, body: (m[2] ?? '').trim() });
  }
  for (const pref of langPrefs) {
    const hit = blocks.find((b) => b.lang === pref && b.body);
    if (hit) return hit.body;
  }
  const unlabeled = blocks.find((b) => !b.lang && b.body);
  if (unlabeled) return unlabeled.body;
  return blocks[0]?.body ?? '';
}

/** Parse fenced ```tsx / ```css blocks from model output. */
export function extractTsxAndCssFromResponse(text: string): { tsx: string; css: string } {
  const fence =
    /```(?:(tsx|typescript|jsx|css|scss)\s*)?\r?\n([\s\S]*?)```/gi;
  let tsx = '';
  let css = '';
  let m: RegExpExecArray | null;
  while ((m = fence.exec(text)) !== null) {
    const lang = (m[1] ?? '').toLowerCase();
    const body = (m[2] ?? '').trim();
    if (!body) continue;
    if (['tsx', 'typescript', 'jsx'].includes(lang)) {
      if (!tsx) tsx = body;
    } else if (['css', 'scss'].includes(lang)) {
      if (!css) css = body;
    } else if (!tsx) {
      tsx = body;
    } else if (!css) {
      css = body;
    }
  }
  if (!tsx) {
    tsx = `import React from 'react';\n\nexport default function Migrated() {\n  return <div>Unparseable AI output; retry or switch provider.</div>;\n}\n`;
  }
  if (!css) {
    css = `.root {\n}\n`;
  }
  return { tsx, css };
}
