import { execa, execaCommand } from 'execa';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { MechanicalDraftConfig } from '../../../shared/ipc-types.js';

export type MechanicalDraftOk = { ok: true; text: string; label: string };
export type MechanicalDraftErr = { ok: false; error: string; label: string };

export type MechanicalDraftOutcome = MechanicalDraftOk | MechanicalDraftErr;

export function substituteMechanicalPlaceholders(
  cmd: string,
  vars: { input: string; outputDir: string; stem: string; projectRoot: string; outFile: string }
): string {
  return cmd
    .replaceAll('{input}', vars.input)
    .replaceAll('{outputDir}', vars.outputDir)
    .replaceAll('{stem}', vars.stem)
    .replaceAll('{projectRoot}', vars.projectRoot)
    .replaceAll('{outFile}', vars.outFile);
}

function stemFromRel(rel: string): string {
  const base = rel.split(/[/\\]/).pop() ?? rel;
  return base.replace(/\.vue$/i, '') || 'Component';
}

function readDraftFromOutputDir(outDir: string, stem: string): string | null {
  const prefer = ['.tsx', '.jsx', '.ts', '.js'].map((ext) => join(outDir, stem + ext));
  for (const p of prefer) {
    if (existsSync(p)) return readFileSync(p, 'utf-8');
  }
  try {
    const names = readdirSync(outDir);
    for (const n of names) {
      if (n.startsWith(stem) && /\.(tsx|jsx|ts|js)$/i.test(n)) {
        return readFileSync(join(outDir, n), 'utf-8');
      }
    }
    const first = names.find((n) => /\.(tsx|jsx|ts|js)$/i.test(n));
    if (first) return readFileSync(join(outDir, first), 'utf-8');
  } catch {
    /* empty */
  }
  return null;
}

/**
 * 对磁盘上的 Vue SFC 跑外部 CLI，生成 React 粗稿文本；跳过条件见返回值 `null`。
 */
export async function runMechanicalDraft(opts: {
  projectRoot: string;
  sourceRel: string;
  cfg: MechanicalDraftConfig;
}): Promise<MechanicalDraftOutcome | null> {
  if (!opts.cfg.enabled || opts.cfg.preset === 'none') return null;

  const absInput = join(opts.projectRoot, opts.sourceRel);
  if (!existsSync(absInput)) {
    return { ok: false, error: `未找到输入文件: ${absInput}`, label: String(opts.cfg.preset) };
  }

  const stem = stemFromRel(opts.sourceRel);
  const timeoutMs = Math.max(10_000, (opts.cfg.timeoutSec ?? 120) * 1000);
  const outDir = mkdtempSync(join(tmpdir(), 'cr-mechanical-'));

  const vars = {
    input: absInput,
    outputDir: outDir,
    stem,
    projectRoot: opts.projectRoot,
    outFile: join(outDir, `${stem}.js`),
  };

  try {
    if (opts.cfg.preset === 'custom') {
      const cmd = (opts.cfg.customCommand ?? '').trim();
      if (!cmd) {
        return { ok: false, error: '已选「自定义命令」但未填写 customCommand', label: 'custom' };
      }
      const script = substituteMechanicalPlaceholders(cmd, vars);
      const r = await execaCommand(script, {
        shell: true,
        cwd: opts.projectRoot,
        timeout: timeoutMs,
        reject: false,
        env: { ...process.env },
      });
      if (r.exitCode !== 0) {
        const tail = `${r.stderr || ''}\n${r.stdout || ''}`.trim() || `exit ${r.exitCode}`;
        return { ok: false, error: tail.slice(0, 4000), label: 'custom' };
      }
    } else if (opts.cfg.preset === 'v2r_llm') {
      const outName = `${stem}.js`;
      const r = await execa(
        'npx',
        ['-y', 'v2r-llm', 'transform', '-i', absInput, '-o', outDir, '-n', outName],
        {
          cwd: opts.projectRoot,
          timeout: timeoutMs,
          reject: false,
          env: { ...process.env },
        }
      );
      if (r.exitCode !== 0) {
        const tail = `${r.stderr || ''}\n${r.stdout || ''}`.trim() || `exit ${r.exitCode}`;
        return { ok: false, error: tail.slice(0, 4000), label: 'v2r-llm' };
      }
    } else if (opts.cfg.preset === 'vue_to_react_vtr') {
      const r = await execa(
        'npx',
        ['--yes', '--package', 'vue-to-react', 'vtr', '-i', absInput, '-o', outDir, '-n', `${stem}.js`],
        {
          cwd: opts.projectRoot,
          timeout: timeoutMs,
          reject: false,
          env: { ...process.env },
        }
      );
      if (r.exitCode !== 0) {
        const tail = `${r.stderr || ''}\n${r.stdout || ''}`.trim() || `exit ${r.exitCode}`;
        return { ok: false, error: tail.slice(0, 4000), label: 'vue-to-react (vtr)' };
      }
    } else {
      return null;
    }

    const fromOut = existsSync(vars.outFile) ? readFileSync(vars.outFile, 'utf-8') : '';
    const text = fromOut.trim() ? fromOut : readDraftFromOutputDir(outDir, stem);
    if (!text?.trim()) {
      const label =
        opts.cfg.preset === 'vue_to_react_vtr'
          ? 'vue-to-react (vtr)'
          : opts.cfg.preset === 'v2r_llm'
            ? 'v2r-llm'
            : 'custom';
      return { ok: false, error: '命令已成功结束但未在临时输出目录中找到 .js/.tsx 初稿', label };
    }

    const label =
      opts.cfg.preset === 'vue_to_react_vtr'
        ? 'vue-to-react (vtr)'
        : opts.cfg.preset === 'v2r_llm'
          ? 'v2r-llm'
          : 'custom';
    return { ok: true, text, label };
  } finally {
    try {
      rmSync(outDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
}
