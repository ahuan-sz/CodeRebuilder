import { randomUUID } from 'node:crypto';
import { getDb } from './db.js';

export type VersionRow = {
  id: string;
  project_id: string;
  file_status_id: string;
  version_no: number;
  round_type: 'initial' | 're_refactor';
  source_snapshot_path: string;
  generated_snapshot_path: string;
  prompt_full_text: string;
  prompt_append_text: string | null;
  model_provider: string;
  model_name: string;
  token_input: number | null;
  token_output: number | null;
  generation_status: 'succeeded' | 'failed';
  failure_reason: string | null;
  created_at: string;
};

export function insertVersion(row: Omit<VersionRow, 'id'> & { id?: string }): VersionRow {
  const db = getDb();
  const id = row.id ?? randomUUID();
  db.prepare(
    `INSERT INTO refactor_versions (
      id, project_id, file_status_id, version_no, round_type,
      source_snapshot_path, generated_snapshot_path, prompt_full_text, prompt_append_text,
      model_provider, model_name, token_input, token_output, generation_status, failure_reason, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    row.project_id,
    row.file_status_id,
    row.version_no,
    row.round_type,
    row.source_snapshot_path,
    row.generated_snapshot_path,
    row.prompt_full_text,
    row.prompt_append_text,
    row.model_provider,
    row.model_name,
    row.token_input,
    row.token_output,
    row.generation_status,
    row.failure_reason,
    row.created_at
  );
  return getDb().prepare(`SELECT * FROM refactor_versions WHERE id = ?`).get(id) as VersionRow;
}

export function getLatestSucceededVersion(
  fileStatusId: string
): VersionRow | undefined {
  return getDb()
    .prepare(
      `SELECT * FROM refactor_versions WHERE file_status_id = ? AND generation_status = 'succeeded' ORDER BY version_no DESC LIMIT 1`
    )
    .get(fileStatusId) as VersionRow | undefined;
}

export function getVersionByNo(
  fileStatusId: string,
  versionNo: number
): VersionRow | undefined {
  return getDb()
    .prepare(
      `SELECT * FROM refactor_versions WHERE file_status_id = ? AND version_no = ?`
    )
    .get(fileStatusId, versionNo) as VersionRow | undefined;
}

export function listVersionsForFile(fileStatusId: string): VersionRow[] {
  return getDb()
    .prepare(
      `SELECT * FROM refactor_versions WHERE file_status_id = ? ORDER BY version_no DESC`
    )
    .all(fileStatusId) as VersionRow[];
}
