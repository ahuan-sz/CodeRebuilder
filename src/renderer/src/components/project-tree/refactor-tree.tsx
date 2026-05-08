import { FolderOutlined, FileOutlined, CheckCircleOutlined } from '@ant-design/icons';
import { Tree, Tag } from 'antd';
import type { DataNode } from 'antd/es/tree';
import type { TreeNode } from '../../../../shared/ipc-types';
import type { RefactorFileStatus } from '../../../../shared/ipc-types';
import { useMemo } from 'react';
import { isReactMirrorPath, reactMirrorRelToVueSource } from '../../utils/react-path-map';

const STATUS_COLORS: Record<string, string> = {
  idle: 'default',
  refactoring: 'processing',
  re_refactoring: 'processing',
  generated_pending: 'warning',
  regenerated_pending: 'warning',
  confirmed: 'success',
  failed: 'error',
};

function toDataNodes(nodes: TreeNode[]): DataNode[] {
  return nodes.map((n) => {
    if (n.type === 'dir') {
      // 唯一 key 需含路径；仅用 dir:name 时多处同名目录会 key 冲突，整枝错位/缩进异常
      const key = n.path || `dir:${n.name}`;
      return {
        key,
        title: (
          <span>
            <FolderOutlined style={{ marginRight: 6 }} />
            {n.name}
          </span>
        ),
        children: n.children?.length ? toDataNodes(n.children) : undefined,
        isLeaf: false,
      };
    }
    const isOut = isReactMirrorPath(n.path);
    const st = (n.status ?? (isOut ? 'output' : 'idle')) as RefactorFileStatus | 'output';
    return {
      key: n.path,
      isLeaf: true,
      title: (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <FileOutlined />
          <span>{n.name}</span>
          {n.checked ? <CheckCircleOutlined style={{ color: '#52c41a' }} /> : null}
          {isOut ? (
            <Tag color="geekblue" style={{ marginInlineEnd: 0 }}>
              输出
            </Tag>
          ) : (
            <Tag color={STATUS_COLORS[st] ?? 'default'} style={{ marginInlineEnd: 0 }}>
              {st}
            </Tag>
          )}
        </span>
      ),
    };
  });
}

type Props = {
  tree: TreeNode[];
  selectedPath: string | null;
  onSelectPath: (path: string) => void;
};

/** 只取第一层目录的 key，供默认展开第一层使用 */
function topLevelDirKeys(nodes: TreeNode[]): string[] {
  return nodes
    .filter((n) => n.type === 'dir')
    .map((n) => n.path || `dir:${n.name}`);
}

export function RefactorTree({ tree, selectedPath, onSelectPath }: Props): JSX.Element {
  const data = useMemo(() => toDataNodes(tree), [tree]);
  const defaultExpandedKeys = useMemo(() => topLevelDirKeys(tree), [tree]);

  return (
    <div style={{ width: '100%', minWidth: 0 }}>
      <Tree
        showLine
        blockNode
        defaultExpandedKeys={defaultExpandedKeys}
        selectedKeys={selectedPath ? [selectedPath] : []}
        treeData={data}
        onSelect={(keys, info) => {
          const k = keys[0];
          if (typeof k !== 'string' || !info.node.isLeaf) return;
          const vue = reactMirrorRelToVueSource(k);
          onSelectPath(vue ?? k);
        }}
      />
    </div>
  );
}
