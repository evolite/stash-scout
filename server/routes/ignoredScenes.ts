import { Router } from "express";
import { db } from "../db.js";

export function ignoredScenesRouter() {
  const router = Router();

  router.post("/ignored-scenes", (req, res) => {
    const id = String(req.body.id);
    db.prepare("INSERT OR IGNORE INTO ignored_scenes (id, ignored_at) VALUES (?, ?)").run(id, new Date().toISOString());
    res.status(204).end();
  });

  router.delete("/ignored-scenes/latest", (_req, res) => {
    const row = db.prepare("SELECT id FROM ignored_scenes ORDER BY ignored_at DESC LIMIT 1").get() as { id: string } | undefined;
    if (!row) {
      res.json({ id: null });
      return;
    }
    db.prepare("DELETE FROM ignored_scenes WHERE id = ?").run(row.id);
    res.json({ id: row.id });
  });

  return router;
}
