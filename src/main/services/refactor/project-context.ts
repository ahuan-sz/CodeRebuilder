import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/** 仓库内可与团队共享：`.coderebuilder/context.md` */
export function readProjectCoderebuilderContext(projectRoot: string): string | undefined {
  const p = join(projectRoot, '.coderebuilder', 'context.md');
  if (!existsSync(p)) return undefined;
  try {
    const t = readFileSync(p, 'utf-8').trim();
    return t || undefined;
  } catch {
    return undefined;
  }
}

/** 合并应用设置里的 Markdown 与项目内文档 */
export function mergeAssistantContexts(
  settingsMarkdown: string | undefined,
  projectFileMarkdown: string | undefined
): string | undefined {
  const chunks = [settingsMarkdown, projectFileMarkdown]
    .map((s) => (typeof s === 'string' ? s.trim() : ''))
    .filter(Boolean);
  if (!chunks.length) return undefined;
  return chunks.join('\n\n---\n\n');
}
