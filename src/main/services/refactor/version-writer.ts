import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * 确保项目根目录的 .gitignore 包含 `.react` 条目。
 * 文件不存在时自动创建；已包含时不重复写入。
 */
function ensureReactGitignore(projectRoot: string): void {
  const gitignorePath = join(projectRoot, '.gitignore');
  const entry = '.react';
  try {
    if (existsSync(gitignorePath)) {
      const content = readFileSync(gitignorePath, 'utf-8');
      // 检查是否已有精确匹配的独立行
      const lines = content.split(/\r?\n/);
      if (lines.some((l) => l.trim() === entry)) return;
      // 追加（保留末尾换行风格）
      const separator = content.endsWith('\n') ? '' : '\n';
      writeFileSync(gitignorePath, `${content}${separator}${entry}\n`, 'utf-8');
    } else {
      writeFileSync(gitignorePath, `${entry}\n`, 'utf-8');
    }
  } catch {
    /* 写入失败不阻断主流程 */
  }
}

export type SnapshotPaths = {
  /** Relative to project root */
  sourceRel: string;
  /** Relative to project root (primary generated artifact) */
  generatedTsxRel: string;
  generatedCssRel: string;
};

export function writeHistorySnapshots(
  projectRoot: string,
  sourceRel: string,
  versionNo: number,
  sourceText: string,
  generatedTsx: string,
  generatedCss: string
): SnapshotPaths {
  ensureReactGitignore(projectRoot);

  const safe = sourceRel.replace(/[/\\]/g, '__');
  const dir = join(projectRoot, '.react', '.history', safe, String(versionNo));
  mkdirSync(dir, { recursive: true });

  const sourceAbs = join(dir, 'source.vue');
  const tsxAbs = join(dir, 'generated.tsx');
  const cssAbs = join(dir, 'generated.module.css');

  writeFileSync(sourceAbs, sourceText, 'utf-8');
  writeFileSync(tsxAbs, generatedTsx, 'utf-8');
  writeFileSync(cssAbs, generatedCss, 'utf-8');

  return {
    sourceRel: relPosix(projectRoot, sourceAbs),
    generatedTsxRel: relPosix(projectRoot, tsxAbs),
    generatedCssRel: relPosix(projectRoot, cssAbs),
  };
}

function relPosix(root: string, abs: string): string {
  return relative(root, abs).split(/[/\\]/).join('/');
}
