import type { RefactorFileStatus, TreeNode } from '../../../shared/ipc-types.js';

/** Directory-only posix path under project root (unique per folder; used as Tree key). */
function dirPathFromParent(parent: TreeNode, segment: string): string {
  if (parent.name === '' && parent.path === '') return segment;
  return parent.path ? `${parent.path}/${segment}` : segment;
}

/** Build nested directory tree from flat relative file paths (posix). */
export function buildTreeFromPaths(
  paths: string[],
  statusByPath: Map<string, RefactorFileStatus>
): TreeNode {
  const root: TreeNode = { name: '', path: '', type: 'dir', children: [] };

  function insert(node: TreeNode, segments: string[], fullRel: string): void {
    if (!segments.length) return;
    const [head, ...rest] = segments;
    if (!node.children) node.children = [];
    let child = node.children.find((c) => c.name === head);
    const isLeafFile = rest.length === 0;

    if (!child) {
      child = {
        name: head,
        path: isLeafFile ? fullRel : dirPathFromParent(node, head),
        type: isLeafFile ? 'file' : 'dir',
        children: isLeafFile ? undefined : [],
      };
      node.children.push(child);
      if (isLeafFile) {
        const st = statusByPath.get(fullRel);
        if (st !== undefined) child.status = st;
        child.checked = st === 'confirmed';
        return;
      }
      insert(child, rest, fullRel);
      return;
    }

    if (isLeafFile) {
      child.path = fullRel;
      child.type = 'file';
      const st = statusByPath.get(fullRel);
      if (st !== undefined) child.status = st;
      child.checked = st === 'confirmed';
      return;
    }

    child.type = 'dir';
    if (!child.path) child.path = dirPathFromParent(node, head);
    if (!child.children) child.children = [];
    insert(child, rest, fullRel);
  }

  for (const rel of paths) {
    const segments = rel.split('/').filter(Boolean);
    insert(root, segments, rel);
  }

  sortTree(root);
  return root;
}

function sortTree(node: TreeNode): void {
  if (!node.children) return;
  node.children.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  for (const c of node.children) sortTree(c);
}

export function treeChildrenAsRoots(tree: TreeNode): TreeNode[] {
  return tree.children ?? [];
}
