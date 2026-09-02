import { Router } from "express";
import { randomUUID } from "node:crypto";
import { db, performerSearchRowTo as rowTo } from "../db.js";
import type { SavedPerformerSearch } from "../../shared/types.js";

// Named performer searches — filter params + the fetched result list, so a
// saved search restores instantly without hitting StashDB. Mirrors
// routes/filters.ts; "Update search" in the UI just PATCHes fresh results.
export function performerSearchesRouter() {
  const router = Router();

  router.get("/performer-searches", (_req, res) => {
    // json_array_length lets SQLite count the stored performers without this
    // process parsing every (potentially multi-MB) results blob.
    const rows = db
      .prepare(
        `SELECT id, name, created_at, updated_at, filter,
                COALESCE(json_array_length(results, '$.performers'), 0) AS result_count
         FROM performer_searches ORDER BY updated_at DESC`,
      )
      .all();
    res.json(
      rows.map((r: any) => ({
        id: r.id,
        name: r.name,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
        filter: JSON.parse(r.filter),
        resultCount: r.result_count,
      })),
    );
  });

  router.get("/performer-searches/:id", (req, res) => {
    const row = db.prepare("SELECT * FROM performer_searches WHERE id = ?").get(req.params.id);
    if (!row) return void res.status(404).end();
    res.json(rowTo(row));
  });

  router.post("/performer-searches", (req, res) => {
    const now = new Date().toISOString();
    const entry: SavedPerformerSearch = {
      id: randomUUID(),
      name: String(req.body.name ?? "Untitled"),
      createdAt: now,
      updatedAt: now,
      filter: req.body.filter ?? {},
      results: req.body.results ?? {},
    };
    db.prepare(
      "INSERT INTO performer_searches (id, name, created_at, updated_at, filter, results) VALUES (?, ?, ?, ?, ?, ?)",
    ).run(entry.id, entry.name, entry.createdAt, entry.updatedAt, JSON.stringify(entry.filter), JSON.stringify(entry.results));
    res.status(201).json(entry);
  });

  router.patch("/performer-searches/:id", (req, res) => {
    const row = db.prepare("SELECT * FROM performer_searches WHERE id = ?").get(req.params.id);
    if (!row) return void res.status(404).end();
    const entry = rowTo(row);
    if (typeof req.body.name === "string" && req.body.name.trim()) entry.name = req.body.name.trim();
    if (req.body.filter && typeof req.body.filter === "object") entry.filter = req.body.filter;
    if (req.body.results !== undefined) entry.results = req.body.results;
    entry.updatedAt = new Date().toISOString();
    db.prepare("UPDATE performer_searches SET name = ?, updated_at = ?, filter = ?, results = ? WHERE id = ?").run(
      entry.name,
      entry.updatedAt,
      JSON.stringify(entry.filter),
      JSON.stringify(entry.results),
      entry.id,
    );
    res.json(entry);
  });

  router.delete("/performer-searches/:id", (req, res) => {
    db.prepare("DELETE FROM performer_searches WHERE id = ?").run(req.params.id);
    res.status(204).end();
  });

  return router;
}
