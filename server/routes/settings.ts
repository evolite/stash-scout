import { Router } from "express";
import type { AppConfig } from "../config.js";
import { isLocalStashConfigured, isWhisparrConfigured } from "../config.js";
import type { LocalStashClient } from "../localStashClient.js";
import type { WhisparrClient } from "../whisparrClient.js";

export function settingsRouter(cfg: AppConfig, localStash?: LocalStashClient, whisparr?: WhisparrClient) {
  const router = Router();

  router.get("/settings", (_req, res) => {
    res.json({
      stashdbConfigured: true,
      localStashConfigured: isLocalStashConfigured(cfg),
      whisparrConfigured: isWhisparrConfigured(cfg),
      whisparrFullyConfigured: !!(cfg.whisparrRootFolderPath && typeof cfg.whisparrQualityProfileId === "number"),
    });
  });

  router.get("/settings/test", async (_req, res) => {
    const [stash, whisparrOk] = await Promise.all([
      localStash ? localStash.testConnection() : Promise.resolve(false),
      whisparr ? whisparr.testConnection() : Promise.resolve(false),
    ]);
    res.json({ stashdb: true, localStash: stash, whisparr: whisparrOk });
  });

  return router;
}
