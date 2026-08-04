import { Router } from "express";
import type { AppConfig } from "../config.js";
import { isStashDBConfigured, isLocalStashConfigured, isWhisparrConfigured } from "../config.js";
import type { LocalStashClient } from "../localStashClient.js";
import type { WhisparrClient } from "../whisparrClient.js";
import { updateConfig } from "../settingsStore.js";

const EDITABLE_FIELDS = [
  "stashdbUrl",
  "stashdbApiKey",
  "localStashUrl",
  "localStashApiKey",
  "localStashRootUrl",
  "whisparrBaseUrl",
  "whisparrApiKey",
  "whisparrRootFolderPath",
  "whisparrQualityProfileId",
  "cfAccessClientId",
  "cfAccessClientSecret",
] as const;

export function settingsRouter(cfg: AppConfig, localStash: LocalStashClient, whisparr: WhisparrClient) {
  const router = Router();

  router.get("/settings", (_req, res) => {
    res.json({
      stashdbConfigured: isStashDBConfigured(cfg),
      localStashConfigured: isLocalStashConfigured(cfg),
      whisparrConfigured: isWhisparrConfigured(cfg),
      whisparrFullyConfigured: !!(cfg.whisparrRootFolderPath && typeof cfg.whisparrQualityProfileId === "number"),
    });
  });

  // Non-secret view of the current config, for prefilling the Settings form.
  // Secret fields are never returned — only whether one is currently set — so
  // the browser never sees a StashDB/Stash/Whisparr key after it's been saved.
  router.get("/settings/config", (_req, res) => {
    res.json({
      stashdbUrl: cfg.stashdbUrl,
      stashdbApiKeySet: !!cfg.stashdbApiKey,
      localStashUrl: cfg.localStashUrl ?? "",
      localStashApiKeySet: !!cfg.localStashApiKey,
      localStashRootUrl: cfg.localStashRootUrl ?? "",
      whisparrBaseUrl: cfg.whisparrBaseUrl ?? "",
      whisparrApiKeySet: !!cfg.whisparrApiKey,
      whisparrRootFolderPath: cfg.whisparrRootFolderPath ?? "",
      whisparrQualityProfileId: cfg.whisparrQualityProfileId ?? null,
      cfAccessClientId: cfg.cfAccessClientId ?? "",
      cfAccessClientSecretSet: !!cfg.cfAccessClientSecret,
    });
  });

  router.put("/settings/config", async (req, res) => {
    const patch: Record<string, unknown> = {};
    for (const field of EDITABLE_FIELDS) {
      if (field in req.body) patch[field] = req.body[field];
    }
    await updateConfig(cfg, patch);
    res.status(204).end();
  });

  router.get("/settings/test", async (_req, res) => {
    const [stash, whisparrOk] = await Promise.all([
      isLocalStashConfigured(cfg) ? localStash.testConnection() : Promise.resolve(false),
      isWhisparrConfigured(cfg) ? whisparr.testConnection() : Promise.resolve(false),
    ]);
    res.json({ stashdb: isStashDBConfigured(cfg), localStash: stash, whisparr: whisparrOk });
  });

  return router;
}
