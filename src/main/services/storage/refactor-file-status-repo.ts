import { randomUUID } from 'node:crypto';
import { getDb } from './db.js';
import type { RefactorFileStatus } from '../../../shared/ipc-types.js';

export type FileStatusRow = {
  id: string;
  project_id: string;
  source_file_path: string;
  target_file_path: string;
  current_status: RefactorFileStatus;
  latest_version_no: number;
  confirmed_version_no: number | null;
  last_error: string | null;
  updated_at: string;
  created_at: string;
};

export function getFileStatus(
  projectId: string,
  sourceFilePath: string
): FileStatusRow | undefined {
  return getDb()
    .prepare(
      `SELECT * FROM refactor_file_status WHERE project_id = ? AND source_file_path = ?`
    )
    .get(projectId, sourceFilePath) as FileStatusRow | undefined;
}

export function getFileStatusById(fileStatusId: string): FileStatusRow | undefined {
  return getDb()
    .prepare(`SELECT * FROM refactor_file_status WHERE id = ?`)
    .get(fileStatusId) as FileStatusRow | undefined;
}

export function upsertFileStatusIdle(
  projectId: string,
  sourceFilePath: string,
  targetFilePath: string
): FileStatusRow {
  const db = getDb();
  const existing = getFileStatus(projectId, sourceFilePath);
  const now = new Date().toISOString();
  if (existing) {
    return existing;
  }
  const id = randomUUID();
  db.prepare(
    `INSERT INTO refactor_file_status (
      id, project_id, source_file_path, target_file_path, current_status,
      latest_version_no, confirmed_version_no, last_error, updated_at, created_at
    ) VALUES (?, ?, ?, ?, 'idle', 0, NULL, NULL, ?, ?)`
  ).run(id, projectId, sourceFilePath, targetFilePath, now, now);
  return getFileStatus(projectId, sourceFilePath)!;
}

export function updateFileStatus(
  projectId: string,
  sourceFilePath: string,
  patch: Partial<Pick<FileStatusRow, 'current_status' | 'latest_version_no' | 'confirmed_version_no' | 'last_error'>>
): void {
  const row = getFileStatus(projectId, sourceFilePath);
  if (!row) return;
  const now = new Date().toISOString();
  const fields: string[] = ['updated_at = ?'];
  const values: unknown[] = [now];
  if (patch.current_status !== undefined) {
    fields.push('current_status = ?');
    values.push(patch.current_status);
  }
  if (patch.latest_version_no !== undefined) {
    fields.push('latest_version_no = ?');
    values.push(patch.latest_version_no);
  }
  if (patch.confirmed_version_no !== undefined) {
    fields.push('confirmed_version_no = ?');
    values.push(patch.confirmed_version_no);
  }
  if (patch.last_error !== undefined) {
    fields.push('last_error = ?');
    values.push(patch.last_error);
  }
  getDb()
    .prepare(
      `UPDATE refactor_file_status SET ${fields.join(', ')} WHERE project_id = ? AND source_file_path = ?`
    )
    .run(...values, projectId, sourceFilePath);
}

export function listFileStatusesByProject(projectId: string): FileStatusRow[] {
  return getDb()
    .prepare(`SELECT * FROM refactor_file_status WHERE project_id = ?`)
    .all(projectId) as FileStatusRow[];
}
