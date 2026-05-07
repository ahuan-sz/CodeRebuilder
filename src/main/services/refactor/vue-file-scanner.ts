import { existsSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  'coverage',
  '.staging',
]);

/** Recursively collect `.vue` paths relative to project root (posix slashes). */
export function scanVueFiles(projectRoot: string): string[] {
  const results: string[] = [];

  function walk(dir: string): void {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const full = join(dir, e.name);
      if (e.isDirectory()) {
        if (SKIP_DIRS.has(e.name)) continue;
        if (e.name.startsWith('.') && e.name !== '.') continue;
        walk(full);
      } else if (e.isFile() && e.name.endsWith('.vue')) {
        results.push(relative(projectRoot, full).split(/[/\\]/).join('/'));
      }
    }
  }

  walk(projectRoot);
  return results.sort();
}

export function isVueProject(projectRoot: string): boolean {
  const files = scanVueFiles(projectRoot);
  return files.length > 0;
}

/** 不遍历的内部目录（快照 / 草稿），不应出现在侧栏树里 */
const REACT_SKIP_DIRS = new Set(['.history', '.staging']);

function isMirrorArtifactFile(name: string): boolean {
  if (name.endsWith('.map')) return false;
  return /\.(tsx|jsx|ts|js|mjs|cjs|css|scss|less|sass)$/i.test(name);
}

/**
 * 收集项目根下 `.react/` 内镜像产物路径（相对 posix），不含 `.history` / `.staging`。
 */
export function scanReactMirrorFiles(projectRoot: string): string[] {
  const reactRoot = join(projectRoot, '.react');
  if (!existsSync(reactRoot)) return [];

  const results: string[] = [];

  function walk(dir: string): void {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const full = join(dir, e.name);
      if (e.isDirectory()) {
        if (REACT_SKIP_DIRS.has(e.name)) continue;
        walk(full);
      } else if (e.isFile() && isMirrorArtifactFile(e.name)) {
        results.push(relative(projectRoot, full).split(/[/\\]/).join('/'));
      }
    }
  }

  walk(reactRoot);
  return results.sort();
}
