import { mkdirSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

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
