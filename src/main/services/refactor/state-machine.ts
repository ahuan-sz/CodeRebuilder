import type { RefactorFileStatus } from '../../../shared/ipc-types.js';

export type RefactorEvent =
  | 'START_REFACTOR'
  | 'REFACTOR_SUCCEEDED'
  | 'REFACTOR_FAILED'
  | 'CONFIRM_ACCEPT'
  | 'CONFIRM_REJECT'
  | 'RETRY_WITH_PROMPT';

/** Returns next status after event, or null if invalid. */
export function transition(
  current: RefactorFileStatus,
  event: RefactorEvent,
  ctx?: { hasConfirmedVersion?: boolean }
): RefactorFileStatus | null {
  switch (current) {
    case 'idle':
      if (event === 'START_REFACTOR') return 'refactoring';
      return null;
    case 'refactoring':
      if (event === 'REFACTOR_SUCCEEDED') return 'generated_pending';
      if (event === 'REFACTOR_FAILED') return 'failed';
      return null;
    case 'generated_pending':
      if (event === 'CONFIRM_ACCEPT') return 'confirmed';
      if (event === 'CONFIRM_REJECT') return 'generated_pending';
      if (event === 'RETRY_WITH_PROMPT') return 're_refactoring';
      return null;
    case 'confirmed':
      if (event === 'RETRY_WITH_PROMPT') return 're_refactoring';
      return null;
    case 're_refactoring':
      if (event === 'REFACTOR_SUCCEEDED') return 'regenerated_pending';
      if (event === 'REFACTOR_FAILED') return 'failed';
      return null;
    case 'regenerated_pending':
      if (event === 'CONFIRM_ACCEPT') return 'confirmed';
      if (event === 'CONFIRM_REJECT') return 'regenerated_pending';
      if (event === 'RETRY_WITH_PROMPT') return 're_refactoring';
      return null;
    case 'failed':
      if (event === 'RETRY_WITH_PROMPT') {
        return ctx?.hasConfirmedVersion ? 're_refactoring' : 'refactoring';
      }
      if (event === 'START_REFACTOR') return 'refactoring';
      return null;
    default:
      return null;
  }
}

export function canStartRefactor(status: RefactorFileStatus): boolean {
  if (status === 'refactoring' || status === 're_refactoring') return false;
  return true;
}

export function isPendingConfirmation(status: RefactorFileStatus): boolean {
  return status === 'generated_pending' || status === 'regenerated_pending';
}

/**
 * 首轮生成 vs 再版（会加载上一版成功生成的 React 作为上下文）。
 * 不再依赖「是否填写追加提示词」：已确认 / 待确认 / 失败但有确认版等均可无追加说明再次重构。
 */
export function resolveRoundType(
  status: RefactorFileStatus,
  _appendPrompt: string | undefined,
  hasConfirmedVersion: boolean
): 'initial' | 're_refactor' {
  if (status === 'confirmed') {
    return 're_refactor';
  }
  if (status === 'generated_pending' || status === 'regenerated_pending') {
    return 're_refactor';
  }
  if (status === 'failed' && hasConfirmedVersion) {
    return 're_refactor';
  }
  return 'initial';
}

export function nextStatusAfterSuccess(round: 'initial' | 're_refactor'): RefactorFileStatus {
  return round === 're_refactor' ? 'regenerated_pending' : 'generated_pending';
}

export function validateCanStartRefactor(
  status: RefactorFileStatus,
  _appendPrompt: string | undefined
): 'TASK_ALREADY_RUNNING' | 'INVALID_STATE' | null {
  if (status === 'refactoring' || status === 're_refactoring') return 'TASK_ALREADY_RUNNING';
  return null;
}

export function runningStatusForRound(round: 'initial' | 're_refactor'): RefactorFileStatus {
  return round === 're_refactor' ? 're_refactoring' : 'refactoring';
}
