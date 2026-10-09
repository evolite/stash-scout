import { Router } from "express";
import type { AppConfig } from "../config.js";
import { isStashDBConfigured, isLocalStashConfigured, isWhisparrConfigured } from "../config.js";
import type { LocalStashClient } from "../localStashClient.js";
import type { WhisparrClient } from "../whisparrClient.js";
import { updateConfig } from "../settingsStore.js";
import { hashPassword } from "../auth.js";
import { discoverOidc } from "./auth.js";

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
  "authMode",
  "authUsername",
  "oidcIssuer",
  "oidcClientId",
  "oidcClientSecret",
  "oidcAllowed",
] as const;

// Returns why the merged config would leave nobody able to log in, or null if fine.
async function authConfigError(next: AppConfig): Promise<string | null> {
  if (next.authMode === "local" && !(next.authUsername && next.authPasswordHash)) {
    return "local auth needs a username and password";
  }
  if (next.authMode !== "oidc") return null;
  if (!(next.oidcIssuer && next.oidcClientId && next.oidcClientSecret)) {
    return "oidc needs issuer, client ID and client secret";
  }
  try {
    await discoverOidc(next);
    return null;
  } catch {
    return "OIDC discovery failed — check the issuer URL";
  }
}

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
      authMode: cfg.authMode,
      authUsername: cfg.authUsername ?? "",
      authPasswordSet: !!cfg.authPasswordHash,
      oidcIssuer: cfg.oidcIssuer ?? "",
      oidcClientId: cfg.oidcClientId ?? "",
      oidcClientSecretSet: !!cfg.oidcClientSecret,
      oidcAllowed: cfg.oidcAllowed ?? "",
    });
  });

  router.put("/settings/config", async (req, res) => {
    const patch: Record<string, unknown> = {};
    for (const field of EDITABLE_FIELDS) {
      if (field in req.body) patch[field] = req.body[field];
    }
    if (patch.authMode !== undefined && !["off", "local", "oidc"].includes(patch.authMode as string)) {
      return res.status(400).json({ error: "invalid authMode" });
    }
    // Plain password is hashed here and never stored; blank = unchanged.
    if (typeof req.body.authPassword === "string" && req.body.authPassword) {
      patch.authPasswordHash = hashPassword(req.body.authPassword);
    }
    // Lockout guard: validate the merged result before applying, so a bad
    // toggle can't leave nobody able to log in.
    const next = { ...cfg, ...Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== "" && v !== undefined)) } as AppConfig;
    const authError = await authConfigError(next);
    if (authError) return res.status(400).json({ error: authError });
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
