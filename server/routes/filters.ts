import { Router } from "express";
import { randomUUID } from "node:crypto";
import { db, filterRowToSavedFilter as rowToFilter } from "../db.js";
import type { SavedFilter } from "../../shared/types.js";

export function filtersRouter() {
  const router = Router();

  router.get("/filters", (_req, res) => {
    const rows = db.prepare("SELECT * FROM filters ORDER BY position, created_at").all();
    res.json(rows.map(rowToFilter));
  });

  // Body: { ids: string[] } in the desired order. Position is the array index.
  router.put("/filters/order", (req, res) => {
    const ids = req.body.ids;
    if (!Array.isArray(ids) || !ids.every((i) => typeof i === "string")) return void res.status(400).json({ error: "ids must be a string array" });
    const set = db.prepare("UPDATE filters SET position = ? WHERE id = ?");
    db.exec("BEGIN");
    try {
      ids.forEach((id, i) => set.run(i + 1, id));
      db.exec("COMMIT");
    } catch (err) {
      db.exec("ROLLBACK");
      throw err;
    }
    res.status(204).end();
  });

  router.post("/filters", (req, res) => {
    const entry: SavedFilter = {
      id: randomUUID(),
      name: String(req.body.name ?? "Untitled"),
      createdAt: new Date().toISOString(),
      filter: req.body.filter ?? {},
      subscribed: false,
      autoAdd: false,
    };
    db.prepare("INSERT INTO filters (id, name, created_at, filter, watched, auto_add, position) VALUES (?, ?, ?, ?, ?, 0, (SELECT COALESCE(MAX(position), 0) + 1 FROM filters))").run(
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
    if (typeof req.body.subscribed === "boolean") entry.subscribed = req.body.subscribed;
    if (typeof req.body.autoAdd === "boolean") entry.autoAdd = req.body.autoAdd;
    if (req.body.filter && typeof req.body.filter === "object") entry.filter = req.body.filter;
    if (typeof req.body.name === "string" && req.body.name.trim()) entry.name = req.body.name.trim();
    db.prepare("UPDATE filters SET name = ?, filter = ?, watched = ?, auto_add = ? WHERE id = ?").run(
      entry.name,
      JSON.stringify(entry.filter),
      entry.subscribed ? 1 : 0,
      entry.autoAdd ? 1 : 0,
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
