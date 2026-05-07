import { randomUUID } from 'node:crypto';
import type { IpcMainInvokeEvent } from 'electron';
import type {
  IPCResponse,
  ReqStartRefactor,
  ResStartRefactor,
} from '../../../shared/ipc-types.js';
import { getProjectById } from '../../services/project-store.js';
import {
  getFileStatus,
  updateFileStatus,
} from '../../services/storage/refactor-file-status-repo.js';
import * as taskLock from '../../services/refactor/task-lock-manager.js';
import {
  resolveRoundType,
  runningStatusForRound,
  validateCanStartRefactor,
} from '../../services/refactor/state-machine.js';
import { runRefactorTask } from '../../services/refactor/refactor-orchestrator.js';

export async function handleStartFile(
  event: IpcMainInvokeEvent,
  req: ReqStartRefactor
): Promise<IPCResponse<ResStartRefactor>> {
  const project = getProjectById(req.projectId);
  if (!project) {
    return { success: false, error: { code: 'NOT_FOUND', message: 'Unknown project' } };
  }

  const row = getFileStatus(req.projectId, req.sourceFilePath);
  if (!row) {
    return {
      success: false,
      error: { code: 'NOT_FOUND', message: 'File status not found; run scan first' },
    };
  }

  const busy = validateCanStartRefactor(row.current_status, req.appendPrompt);
  if (busy === 'INVALID_STATE') {
    return {
      success: false,
      error: {
        code: 'INVALID_STATE',
        message: '当前状态不允许启动重构',
      },
    };
  }
  if (busy === 'TASK_ALREADY_RUNNING') {
    return {
      success: false,
      error: { code: 'TASK_ALREADY_RUNNING', message: 'Refactor already running for file' },
    };
  }

  const taskId = randomUUID();
  if (!taskLock.tryAcquire(req.projectId, req.sourceFilePath, taskId)) {
    return {
      success: false,
      error: { code: 'TASK_ALREADY_RUNNING', message: 'Could not acquire task lock' },
    };
  }

  const hasConfirmed = (row.confirmed_version_no ?? 0) > 0;
  const round = resolveRoundType(row.current_status, req.appendPrompt, hasConfirmed);
  const running = runningStatusForRound(round);

  updateFileStatus(req.projectId, req.sourceFilePath, {
    current_status: running,
    last_error: null,
  });

  const updated = getFileStatus(req.projectId, req.sourceFilePath);
  if (updated) {
    event.sender.send('refactor:file-status-updated', {
      projectId: req.projectId,
      sourceFilePath: req.sourceFilePath,
      status: updated.current_status,
      confirmedVersionNo: updated.confirmed_version_no,
    });
  }

  void runRefactorTask({
    projectId: req.projectId,
    sourceFilePath: req.sourceFilePath,
    appendPrompt: req.appendPrompt,
    baseVersionNo: req.baseVersionNo,
    migrationSkillId: req.migrationSkill,
    taskId,
    webContents: event.sender,
  });

  return {
    success: true,
    data: {
      taskId,
      fileStatusId: row.id,
      nextStatus: running,
    },
  };
}
