import type {
  IPCResponse,
  ReqGetLatestDiff,
  ResGetLatestDiff,
} from '../../../shared/ipc-types.js';
import { getFilePreview } from '../../services/refactor/version-history-service.js';

export async function handleGetLatestDiff(
  _e: unknown,
  req: ReqGetLatestDiff
): Promise<IPCResponse<ResGetLatestDiff>> {
  const preview = getFilePreview(req.projectId, req.sourceFilePath);
  if (!preview) {
    return {
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: '无法读取该文件（路径无效或文件不存在）',
      },
    };
  }
  return { success: true, data: preview };
}
