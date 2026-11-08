CREATE TABLE IF NOT EXISTS filters (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  filter TEXT NOT NULL,
  watched INTEGER NOT NULL DEFAULT 0,
  auto_add INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS global_exclude_tags (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  added_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ignored_scenes (
  id TEXT PRIMARY KEY,
  ignored_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE IF NOT EXISTS performer_searches (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  filter TEXT NOT NULL,
  results TEXT NOT NULL
);
