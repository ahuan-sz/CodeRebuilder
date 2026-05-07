import { randomUUID } from 'node:crypto';
import { getDb } from './db.js';

export type ConfirmationRow = {
  id: string;
  project_id: string;
  file_status_id: string;
  version_id: string;
  action: 'accept' | 'reject';
  reviewer: string;
  comment: string | null;
  confirmed_at: string;
};

export function insertConfirmation(row: Omit<ConfirmationRow, 'id'>): ConfirmationRow {
  const id = randomUUID();
  const db = getDb();
  db.prepare(
    `INSERT INTO refactor_confirmations (id, project_id, file_status_id, version_id, action, reviewer, comment, confirmed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    row.project_id,
    row.file_status_id,
    row.version_id,
    row.action,
    row.reviewer,
    row.comment,
    row.confirmed_at
  );
  return db.prepare(`SELECT * FROM refactor_confirmations WHERE id = ?`).get(id) as ConfirmationRow;
}
