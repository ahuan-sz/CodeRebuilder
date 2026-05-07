import type { IpcMainInvokeEvent } from 'electron';
import { BrowserWindow } from 'electron';
import type {
  IPCErrorCode,
  IPCResponse,
  ReqConfirmVersion,
  ResConfirmVersion,
} from '../../../shared/ipc-types.js';
import { confirmVersion as confirmService } from '../../services/refactor/confirm-service.js';

function mapErr(message: string): IPCResponse<never> {
  const code: IPCErrorCode =
    message === 'NOT_FOUND'
      ? 'NOT_FOUND'
      : message === 'VERSION_NOT_FOUND'
        ? 'VERSION_NOT_FOUND'
        : message === 'VALIDATION_FAILED'
          ? 'VALIDATION_FAILED'
          : message === 'INVALID_STATE'
            ? 'INVALID_STATE'
            : 'INTERNAL';
  return { success: false, error: { code, message } };
}

export async function handleConfirmVersion(
  event: IpcMainInvokeEvent,
  req: ReqConfirmVersion
): Promise<IPCResponse<ResConfirmVersion>> {
  try {
    const result = confirmService({
      ...req,
      reviewer:
        req.reviewer ||
        (typeof process.env.USER === 'string' ? process.env.USER : 'local-user'),
    });
    const win = BrowserWindow.fromWebContents(event.sender);
    win?.webContents.send('refactor:file-status-updated', {
      projectId: req.projectId,
      sourceFilePath: req.sourceFilePath,
      status: result.status,
      confirmedVersionNo: result.confirmedVersionNo ?? null,
    });
    return { success: true, data: result };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return mapErr(msg);
  }
}
