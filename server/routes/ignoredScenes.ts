import { Router } from "express";
import { db } from "../db.js";

export function ignoredScenesRouter() {
  const router = Router();

  router.post("/ignored-scenes", (req, res) => {
    const id = String(req.body.id);
    db.prepare("INSERT OR IGNORE INTO ignored_scenes (id, ignored_at) VALUES (?, ?)").run(id, new Date().toISOString());
    res.status(204).end();
  });

  return router;
}
