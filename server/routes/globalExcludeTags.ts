import { Router } from "express";
import { db } from "../db.js";
import type { GlobalExcludeTag } from "../../shared/types.js";

function rowToTag(row: any): GlobalExcludeTag {
  return { id: row.id, name: row.name, addedAt: row.added_at };
}

function listTags(): GlobalExcludeTag[] {
  return (db.prepare("SELECT * FROM global_exclude_tags ORDER BY added_at").all() as any[]).map(rowToTag);
}

export function globalExcludeTagsRouter() {
  const router = Router();

  router.get("/global-exclude-tags", (_req, res) => {
    res.json(listTags());
  });

  router.post("/global-exclude-tags", (req, res) => {
    const id = String(req.body.id);
    const name = String(req.body.name ?? id);
    const exists = db.prepare("SELECT 1 FROM global_exclude_tags WHERE id = ?").get(id);
    if (!exists) {
      db.prepare("INSERT INTO global_exclude_tags (id, name, added_at) VALUES (?, ?, ?)").run(id, name, new Date().toISOString());
    }
    res.status(201).json(listTags());
  });

  router.delete("/global-exclude-tags/:id", (req, res) => {
    db.prepare("DELETE FROM global_exclude_tags WHERE id = ?").run(req.params.id);
    res.status(204).end();
  });

  return router;
}
