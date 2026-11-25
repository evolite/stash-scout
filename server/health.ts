import { Router } from "express";
import type { DatabaseSync } from "node:sqlite";

export function healthRouter(version: string, db: DatabaseSync): Router {
  const router = Router();

  router.get("/healthz", (_req, res) => {
    let database = "ok";
    try {
      db.prepare("SELECT 1").get();
    } catch {
      database = "error";
    }
    const healthy = database === "ok";
    res
      .status(healthy ? 200 : 503)
      .set("Cache-Control", "no-store")
      .json({ status: healthy ? "ok" : "error", version, checks: { database } });
  });

  return router;
}
