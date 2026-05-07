import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getProjectById } from '../project-store.js';
import { getFileStatus } from '../storage/refactor-file-status-repo.js';
import {
  getLatestSucceededVersion,
  getVersionByNo,
} from '../storage/refactor-versions-repo.js';
import type { RefactorFileStatus } from '../../../shared/ipc-types.js';

export type LatestDiff = {
  sourceCode: string;
  generatedCode: string;
  versionNo: number;
  status: RefactorFileStatus;
};

/** 工作台预览：至少包含磁盘上的 Vue 源码；若有成功快照则附带生成代码 */
export type FilePreviewResult = {
  sourceCode: string;
  generatedCode: string;
  versionNo: number | null;
  status: RefactorFileStatus;
  hasGeneratedSnapshot: boolean;
};

function isSafeProjectRelative(rel: string): boolean {
  if (!rel || rel.includes('..')) return false;
  const norm = rel.replace(/\\/g, '/');
  return !norm.startsWith('/');
}

export function getFilePreview(projectId: string, sourceFilePath: string): FilePreviewResult | null {
  if (!isSafeProjectRelative(sourceFilePath)) return null;
  const project = getProjectById(projectId);
  if (!project) return null;
  const root = project.root_path;
  let sourceCode: string;
  try {
    sourceCode = readFileSync(join(root, sourceFilePath), 'utf-8');
  } catch {
    return null;
  }

  const row = getFileStatus(projectId, sourceFilePath);
  if (!row) {
    return {
      sourceCode,
      generatedCode: '',
      versionNo: null,
      status: 'idle',
      hasGeneratedSnapshot: false,
    };
  }

  const latestOk = getLatestSucceededVersion(row.id);
  if (!latestOk) {
    return {
      sourceCode,
      generatedCode: '',
      versionNo: null,
      status: row.current_status as RefactorFileStatus,
      hasGeneratedSnapshot: false,
    };
  }

  let generatedCode = '';
  try {
    generatedCode = readFileSync(join(root, latestOk.generated_snapshot_path), 'utf-8');
  } catch {
    generatedCode = '';
  }

  return {
    sourceCode,
    generatedCode,
    versionNo: latestOk.version_no,
    status: row.current_status as RefactorFileStatus,
    hasGeneratedSnapshot: generatedCode.length > 0,
  };
}

/** @deprecated 使用 {@link getFilePreview}；保留供仅需「最新成功版」差异的旧逻辑 */
export function getLatestDiff(
  projectId: string,
  sourceFilePath: string
): LatestDiff | null {
  const project = getProjectById(projectId);
  if (!project) return null;
  const row = getFileStatus(projectId, sourceFilePath);
  if (!row) return null;
  const v = getVersionByNo(row.id, row.latest_version_no);
  if (!v || v.generation_status !== 'succeeded') {
    return null;
  }
  const root = project.root_path;
  try {
    const sourceCode = readFileSync(join(root, sourceFilePath), 'utf-8');
    const generatedCode = readFileSync(join(root, v.generated_snapshot_path), 'utf-8');
    return {
      sourceCode,
      generatedCode,
      versionNo: v.version_no,
      status: row.current_status,
    };
  } catch {
    return null;
  }
}
