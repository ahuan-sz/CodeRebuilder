import type {
  IPCResponse,
  ReqListVersions,
  VersionListItem,
} from '../../../shared/ipc-types.js';
import { getProjectById } from '../../services/project-store.js';
import {
  getFileStatus,
} from '../../services/storage/refactor-file-status-repo.js';
import { listVersionsForFile } from '../../services/storage/refactor-versions-repo.js';

export async function handleListVersions(
  _e: unknown,
  req: ReqListVersions
): Promise<IPCResponse<VersionListItem[]>> {
  const project = getProjectById(req.projectId);
  if (!project) {
    return { success: false, error: { code: 'NOT_FOUND', message: 'Unknown project' } };
  }
  const row = getFileStatus(req.projectId, req.sourceFilePath);
  if (!row) {
    return { success: false, error: { code: 'NOT_FOUND', message: 'File not tracked' } };
  }
  const rows = listVersionsForFile(row.id);
  const data: VersionListItem[] = rows.map((v) => ({
    versionNo: v.version_no,
    roundType: v.round_type as 'initial' | 're_refactor',
    generationStatus: v.generation_status,
    createdAt: v.created_at,
    modelName: v.model_name,
  }));
  return { success: true, data };
}
