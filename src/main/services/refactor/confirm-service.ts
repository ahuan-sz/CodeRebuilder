import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { RefactorFileStatus } from '../../../shared/ipc-types.js';
import { getProjectById } from '../project-store.js';
import {
  getFileStatus,
  updateFileStatus,
} from '../storage/refactor-file-status-repo.js';
import { getVersionByNo } from '../storage/refactor-versions-repo.js';
import { insertConfirmation } from '../storage/refactor-confirmations-repo.js';
import { writeConfirmedArtifacts } from '../refactor/react-target-writer.js';
import { isPendingConfirmation } from '../refactor/state-machine.js';

export type ConfirmResult = {
  status: RefactorFileStatus;
  checked: boolean;
  confirmedVersionNo?: number;
};

export function confirmVersion(args: {
  projectId: string;
  sourceFilePath: string;
  versionNo: number;
  action: 'accept' | 'reject';
  reviewer: string;
  comment?: string;
}): ConfirmResult {
  const project = getProjectById(args.projectId);
  if (!project) {
    throw new Error('NOT_FOUND');
  }
  const row = getFileStatus(args.projectId, args.sourceFilePath);
  if (!row) {
    throw new Error('NOT_FOUND');
  }

  if (!isPendingConfirmation(row.current_status)) {
    throw new Error('INVALID_STATE');
  }

  const ver = getVersionByNo(row.id, args.versionNo);
  if (!ver || ver.generation_status !== 'succeeded') {
    throw new Error('VERSION_NOT_FOUND');
  }

  const root = project.root_path;
  try {
    readFileSync(join(root, args.sourceFilePath), 'utf-8');
    readFileSync(join(root, ver.generated_snapshot_path), 'utf-8');
  } catch {
    throw new Error('VALIDATION_FAILED');
  }

  const now = new Date().toISOString();

  if (args.action === 'reject') {
    insertConfirmation({
      project_id: args.projectId,
      file_status_id: row.id,
      version_id: ver.id,
      action: 'reject',
      reviewer: args.reviewer,
      comment: args.comment ?? null,
      confirmed_at: now,
    });
    return { status: row.current_status, checked: row.current_status === 'confirmed' };
  }

  insertConfirmation({
    project_id: args.projectId,
    file_status_id: row.id,
    version_id: ver.id,
    action: 'accept',
    reviewer: args.reviewer,
    comment: args.comment ?? null,
    confirmed_at: now,
  });

  writeConfirmedArtifacts(root, ver.generated_snapshot_path, args.sourceFilePath);

  updateFileStatus(args.projectId, args.sourceFilePath, {
    current_status: 'confirmed',
    confirmed_version_no: args.versionNo,
    last_error: null,
  });

  return {
    status: 'confirmed',
    checked: true,
    confirmedVersionNo: args.versionNo,
  };
}
