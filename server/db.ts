import { DatabaseSync } from "node:sqlite";
import { existsSync, renameSync, readFileSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { strict as assert } from "node:assert";
import { tmpdir } from "node:os";
import path from "node:path";
import type { SavedFilter, GlobalExcludeTag, IgnoredScene, SavedPerformerSearch } from "../shared/types.js";

const REAL_DATA_DIR = path.join(process.cwd(), "data");

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS filters (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL,
    filter TEXT NOT NULL,
    watched INTEGER NOT NULL DEFAULT 0, -- column keeps its old name; the app calls it "subscribed"
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
`;

function readJsonSync<T>(dataDir: string, file: string, fallback: T): T {
  try {
    return JSON.parse(readFileSync(path.join(dataDir, file), "utf8")) as T;
  } catch {
    return fallback;
  }
}

function migrateFromJson(db: DatabaseSync, dataDir: string): void {
  const legacyFiles = ["filters.json", "global-exclude-tags.json", "ignored-scenes.json", "settings.json"];
  const anyLegacy = legacyFiles.some((f) => existsSync(path.join(dataDir, f)));
  if (!anyLegacy) return;

  db.exec("BEGIN");
  try {
    const filters = readJsonSync<SavedFilter[]>(dataDir, "filters.json", []);
    const insertFilter = db.prepare("INSERT OR IGNORE INTO filters (id, name, created_at, filter, watched) VALUES (?, ?, ?, ?, ?)");
    for (const f of filters) insertFilter.run(f.id, f.name, f.createdAt, JSON.stringify(f.filter), ((f as { watched?: boolean }).watched ?? f.subscribed) ? 1 : 0);

    const excludeTags = readJsonSync<GlobalExcludeTag[]>(dataDir, "global-exclude-tags.json", []);
    const insertExcludeTag = db.prepare("INSERT OR IGNORE INTO global_exclude_tags (id, name, added_at) VALUES (?, ?, ?)");
    for (const t of excludeTags) insertExcludeTag.run(t.id, t.name, t.addedAt);

    const ignored = readJsonSync<IgnoredScene[]>(dataDir, "ignored-scenes.json", []);
    const insertIgnored = db.prepare("INSERT OR IGNORE INTO ignored_scenes (id, ignored_at) VALUES (?, ?)");
    for (const s of ignored) insertIgnored.run(s.id, s.ignoredAt);

    const settings = readJsonSync<Record<string, unknown> | null>(dataDir, "settings.json", null);
    if (settings !== null) {
      db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES ('config', ?)").run(JSON.stringify(settings));
    }

    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }

  for (const f of legacyFiles) {
    const full = path.join(dataDir, f);
    if (existsSync(full)) renameSync(full, `${full}.bak`);
  }
}

export function openDb(dataDir: string): DatabaseSync {
  const db = new DatabaseSync(path.join(dataDir, "app.db"));
  db.exec("PRAGMA journal_mode = WAL");
  db.exec(SCHEMA);
  try {
    db.exec("ALTER TABLE filters ADD COLUMN auto_add INTEGER NOT NULL DEFAULT 0");
  } catch {
    /* ignore */
  }
  try {
    db.exec("ALTER TABLE filters ADD COLUMN position INTEGER NOT NULL DEFAULT 0");
  } catch {
    /* ignore */
  }
  migrateFromJson(db, dataDir);
  return db;
}

export const db = openDb(REAL_DATA_DIR);

export function filterRowToSavedFilter(row: any): SavedFilter {
  return { id: row.id, name: row.name, createdAt: row.created_at, filter: JSON.parse(row.filter), subscribed: !!row.watched, autoAdd: !!row.auto_add };
}

export function performerSearchRowTo(row: any): SavedPerformerSearch {
  return {
    id: row.id,
    name: row.name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    filter: JSON.parse(row.filter),
    results: JSON.parse(row.results),
  };
}

function demo(): void {
  const tmp = mkdtempSync(path.join(tmpdir(), "stash-scout-db-test-"));
  writeFileSync(
    path.join(tmp, "filters.json"),
    JSON.stringify([{ id: "f1", name: "Test", createdAt: "2024-01-01", filter: { text: "x" }, watched: true }]),
  );
  writeFileSync(path.join(tmp, "global-exclude-tags.json"), JSON.stringify([{ id: "t1", name: "tag", addedAt: "2024-01-01" }]));
  writeFileSync(path.join(tmp, "ignored-scenes.json"), JSON.stringify([{ id: "s1", ignoredAt: "2024-01-01" }]));
  writeFileSync(path.join(tmp, "settings.json"), JSON.stringify({ stashdbUrl: "https://example" }));

  const testDb = openDb(tmp);
  assert.equal((testDb.prepare("SELECT COUNT(*) as c FROM filters").get() as { c: number }).c, 1);
  assert.equal(filterRowToSavedFilter(testDb.prepare("SELECT * FROM filters").get()).autoAdd, false);
  assert.equal((testDb.prepare("SELECT COUNT(*) as c FROM global_exclude_tags").get() as { c: number }).c, 1);
  assert.equal((testDb.prepare("SELECT COUNT(*) as c FROM ignored_scenes").get() as { c: number }).c, 1);
  assert.equal(
    (testDb.prepare("SELECT value FROM settings WHERE key = 'config'").get() as { value: string }).value,
    JSON.stringify({ stashdbUrl: "https://example" }),
  );
  assert.ok(!existsSync(path.join(tmp, "filters.json")), "filters.json should have been renamed to .bak");
  assert.ok(existsSync(path.join(tmp, "filters.json.bak")));
  testDb.close();

  const reopened = openDb(tmp);
  assert.equal((reopened.prepare("SELECT COUNT(*) as c FROM filters").get() as { c: number }).c, 1);
  reopened.close();

  writeFileSync(path.join(tmp, "settings.json"), JSON.stringify({ stashdbUrl: "https://stray" }));
  const reopenedAgain = openDb(tmp);
  assert.equal(
    (reopenedAgain.prepare("SELECT value FROM settings WHERE key = 'config'").get() as { value: string }).value,
    JSON.stringify({ stashdbUrl: "https://example" }),
    "original migrated settings row should win over a stray re-created legacy file",
  );
  reopenedAgain.close();

  rmSync(tmp, { recursive: true, force: true });
  console.log("db.ts self-check passed");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  demo();
}
