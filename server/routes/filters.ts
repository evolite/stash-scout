import { Router } from "express";
import { randomUUID } from "node:crypto";
import { db, filterRowToSavedFilter as rowToFilter } from "../db.js";
import type { SavedFilter } from "../../shared/types.js";

export function filtersRouter() {
  const router = Router();

  router.get("/filters", (_req, res) => {
    const rows = db.prepare("SELECT * FROM filters ORDER BY created_at").all();
    res.json(rows.map(rowToFilter));
  });

  router.post("/filters", (req, res) => {
    const entry: SavedFilter = {
      id: randomUUID(),
      name: String(req.body.name ?? "Untitled"),
      createdAt: new Date().toISOString(),
      filter: req.body.filter ?? {},
      watched: false,
    };
    db.prepare("INSERT INTO filters (id, name, created_at, filter, watched) VALUES (?, ?, ?, ?, ?)").run(
      entry.id,
      entry.name,
      entry.createdAt,
      JSON.stringify(entry.filter),
      0,
    );
    res.status(201).json(entry);
  });

  router.patch("/filters/:id", (req, res) => {
    const row = db.prepare("SELECT * FROM filters WHERE id = ?").get(req.params.id);
    if (!row) return void res.status(404).end();
    const entry = rowToFilter(row);
    if (typeof req.body.watched === "boolean") entry.watched = req.body.watched;
    if (req.body.filter && typeof req.body.filter === "object") entry.filter = req.body.filter;
    if (typeof req.body.name === "string" && req.body.name.trim()) entry.name = req.body.name.trim();
    db.prepare("UPDATE filters SET name = ?, filter = ?, watched = ? WHERE id = ?").run(
      entry.name,
      JSON.stringify(entry.filter),
      entry.watched ? 1 : 0,
      entry.id,
    );
    res.json(entry);
  });

  router.delete("/filters/:id", (req, res) => {
    db.prepare("DELETE FROM filters WHERE id = ?").run(req.params.id);
    res.status(204).end();
  });

  return router;
}
