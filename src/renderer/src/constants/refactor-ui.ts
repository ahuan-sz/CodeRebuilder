import type { RefactorFileStatus } from '../../../shared/ipc-types';

/** 主进程发来的 phase 字段 → 界面文案 */
export const REFACTOR_PHASE_LABELS: Record<string, string> = {
  parse: '解析 Vue 单文件组件',
  ai: '调用 AI 生成代码',
  extract: '解析生成结果',
  write: '写入版本快照',
};

export function phaseDisplayLabel(phase: string): string {
  return REFACTOR_PHASE_LABELS[phase] ?? phase;
}

/** 文件重构状态 → 简短中文（工作台展示） */
export const FILE_STATUS_LABELS: Record<RefactorFileStatus, string> = {
  idle: '待处理',
  refactoring: '首次重构中',
  re_refactoring: '再次重构中',
  generated_pending: '待确认（首版）',
  regenerated_pending: '待确认（再版）',
  confirmed: '已确认',
  failed: '失败',
};

/** Ant Design Tag `color`，与工作台、侧栏风格一致 */
export function refactorStatusTagColor(
  s: RefactorFileStatus | null | undefined
): 'processing' | 'warning' | 'error' | 'success' | 'default' {
  if (s == null) return 'default';
  if (s === 'refactoring' || s === 're_refactoring') return 'processing';
  if (s === 'generated_pending' || s === 'regenerated_pending') return 'warning';
  if (s === 'failed') return 'error';
  if (s === 'confirmed') return 'success';
  return 'default';
}
