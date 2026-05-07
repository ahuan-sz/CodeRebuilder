import { randomUUID } from 'node:crypto';
import { getDb } from './storage/db.js';

export type ProjectRow = {
  id: string;
  root_path: string;
  display_name: string | null;
  created_at: string;
  updated_at: string;
};

export function createOrGetProject(rootPath: string, displayName?: string): ProjectRow {
  const db = getDb();
  const normalized = rootPath.replace(/[/\\]+$/, '');
  const existing = db
    .prepare(`SELECT * FROM projects WHERE root_path = ?`)
    .get(normalized) as ProjectRow | undefined;
  if (existing) {
    return existing;
  }
  const id = randomUUID();
  const now = new Date().toISOString();
  const name = displayName ?? normalized.split(/[/\\]/).pop() ?? 'project';
  db.prepare(
    `INSERT INTO projects (id, root_path, display_name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`
  ).run(id, normalized, name, now, now);
  return {
    id,
    root_path: normalized,
    display_name: name,
    created_at: now,
    updated_at: now,
  };
}

export function getProjectById(projectId: string): ProjectRow | undefined {
  return getDb().prepare(`SELECT * FROM projects WHERE id = ?`).get(projectId) as ProjectRow | undefined;
}
