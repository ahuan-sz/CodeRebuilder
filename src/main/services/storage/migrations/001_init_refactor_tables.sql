-- Projects opened in the app
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  root_path TEXT NOT NULL UNIQUE,
  display_name TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS refactor_file_status (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  source_file_path TEXT NOT NULL,
  target_file_path TEXT NOT NULL,
  current_status TEXT NOT NULL,
  latest_version_no INTEGER NOT NULL DEFAULT 0,
  confirmed_version_no INTEGER,
  last_error TEXT,
  updated_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(project_id, source_file_path),
  FOREIGN KEY (project_id) REFERENCES projects(id)
);

CREATE INDEX IF NOT EXISTS idx_rfs_project_status
  ON refactor_file_status(project_id, current_status);

CREATE TABLE IF NOT EXISTS refactor_versions (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  file_status_id TEXT NOT NULL,
  version_no INTEGER NOT NULL,
  round_type TEXT NOT NULL,
  source_snapshot_path TEXT NOT NULL,
  generated_snapshot_path TEXT NOT NULL,
  prompt_full_text TEXT NOT NULL,
  prompt_append_text TEXT,
  model_provider TEXT NOT NULL,
  model_name TEXT NOT NULL,
  token_input INTEGER,
  token_output INTEGER,
  generation_status TEXT NOT NULL,
  failure_reason TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (file_status_id) REFERENCES refactor_file_status(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_rv_file_version
  ON refactor_versions(file_status_id, version_no);

CREATE TABLE IF NOT EXISTS refactor_confirmations (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  file_status_id TEXT NOT NULL,
  version_id TEXT NOT NULL,
  action TEXT NOT NULL,
  reviewer TEXT NOT NULL,
  comment TEXT,
  confirmed_at TEXT NOT NULL,
  FOREIGN KEY (file_status_id) REFERENCES refactor_file_status(id),
  FOREIGN KEY (version_id) REFERENCES refactor_versions(id)
);

CREATE INDEX IF NOT EXISTS idx_rc_file_time
  ON refactor_confirmations(file_status_id, confirmed_at DESC);
