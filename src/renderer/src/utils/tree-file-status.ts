import type { TreeNode } from '../../../shared/ipc-types';
import type { RefactorFileStatus } from '../../../shared/ipc-types';

/** 从扫描树读取指定文件的当前重构状态（随 IPC 实时 patch）。 */
export function findFileStatusInTree(
  tree: TreeNode[],
  path: string | null
): RefactorFileStatus | undefined {
  if (!path) return undefined;
  const walk = (nodes: TreeNode[]): RefactorFileStatus | undefined => {
    for (const n of nodes) {
      if (n.type === 'file' && n.path === path) {
        return n.status as RefactorFileStatus | undefined;
      }
      if (n.children?.length) {
        const r = walk(n.children);
        if (r !== undefined) return r;
      }
    }
    return undefined;
  };
  return walk(tree);
}
