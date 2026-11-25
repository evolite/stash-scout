import { Router } from "express";
import type { DatabaseSync } from "node:sqlite";
import { isLocalStashConfigured, type AppConfig } from "./config.js";
import type { LocalStashClient } from "./localStashClient.js";

const STASH_CACHE_TTL_MS = 45_000;

export function healthRouter(version: string, db: DatabaseSync, cfg: AppConfig, localStash: LocalStashClient): Router {
  const router = Router();
  let stashCache: { key: string; at: number; promise: Promise<string> } | null = null;

  function checkDatabase(): string {
    try {
      db.prepare("SELECT 1").get();
      return "ok";
    } catch {
      return "error";
    }
  }

  function checkStash(): Promise<string> {
    if (!isLocalStashConfigured(cfg)) return Promise.resolve("not_configured");
    const key = `${cfg.localStashUrl}\n${cfg.localStashApiKey}`;
    if (stashCache?.key === key && Date.now() - stashCache.at < STASH_CACHE_TTL_MS) return stashCache.promise;
    const promise = localStash
      .systemStatus()
      .then((status) => status.toLowerCase())
      .catch(() => "error");
    stashCache = { key, at: Date.now(), promise };
    return promise;
  }

  router.get("/healthz", async (req, res) => {
    const checks: Record<string, string> = { database: checkDatabase() };
    if (req.query.checks !== "local") checks.stash = await checkStash();
    const healthy = Object.values(checks).every((c) => c === "ok" || c === "not_configured");
    res
      .status(healthy ? 200 : 503)
      .set("Cache-Control", "no-store")
      .json({ status: healthy ? "ok" : "error", version, checks });
  });

  return router;
}
