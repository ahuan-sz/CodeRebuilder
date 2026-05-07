import { copyFileSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { loadConfig } from '../config-manager.js';

/** Map `src/a/Foo.vue` → `.react/src/a/Foo.tsx` (or `.jsx`). */
export function sourceVueToTargetReactRel(sourceRel: string): string {
  const ext = loadConfig().ai.targetExt;
  const without = sourceRel.replace(/\.vue$/i, '');
  return `.react/${without}.${ext}`;
}

export function sourceVueToTargetCssModuleRel(sourceRel: string): string {
  const without = sourceRel.replace(/\.vue$/i, '');
  return `.react/${without}.module.css`;
}

export function writeConfirmedArtifacts(
  projectRoot: string,
  historyGeneratedTsxPath: string,
  sourceRel: string
): { tsxRel: string; cssRel: string } {
  const cssHistoryRel = historyCssPathFromTsxRel(historyGeneratedTsxPath);
  const tsxRel = sourceVueToTargetReactRel(sourceRel);
  const cssRel = sourceVueToTargetCssModuleRel(sourceRel);
  const tsxAbs = join(projectRoot, tsxRel);
  const cssAbs = join(projectRoot, cssRel);
  mkdirSync(dirname(tsxAbs), { recursive: true });
  mkdirSync(dirname(cssAbs), { recursive: true });

  const tsxSrc = join(projectRoot, historyGeneratedTsxPath);
  const cssSrc = join(projectRoot, cssHistoryRel);

  copyFileSync(tsxSrc, tsxAbs);
  copyFileSync(cssSrc, cssAbs);

  return { tsxRel, cssRel };
}

export function historyCssPathFromTsxRel(tsxRel: string): string {
  return tsxRel.replace(/generated\.tsx$/i, 'generated.module.css');
}
