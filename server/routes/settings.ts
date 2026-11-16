import { Router } from "express";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { db } from "../db.js";
import rateLimit from "express-rate-limit";
import type { AppConfig } from "../config.js";
import { isStashDBConfigured, isLocalStashConfigured, isWhisparrConfigured, extraHeaders, HEADER_NAME } from "../config.js";
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
  "extraHeaders",
  "authMode",
  "authUsername",
  "oidcIssuer",
  "oidcClientId",
  "oidcClientSecret",
  "oidcAllowed",
] as const;

function parseHeaderRows(rows: unknown, saved: Record<string, string>): { block: string | null } | { error: string } {
  if (!Array.isArray(rows)) return { error: "invalid extraHeaders" };
  const lines: string[] = [];
  for (const h of rows as { name?: unknown; value?: unknown }[]) {
    const name = typeof h?.name === "string" ? h.name.trim() : "";
    const value = (typeof h?.value === "string" ? h.value.trim() : "") || saved[name];
    if (!HEADER_NAME.test(name)) return { error: `invalid header name "${name}"` };
    if (!value) return { error: `header "${name}" needs a value` };
    if (/[\r\n]/.test(value)) return { error: `header "${name}" value can't contain line breaks` };
    lines.push(`${name}: ${value}`);
  }
  return { block: lines.length ? lines.join("\n") : null };
}

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
  const saveLimiter = rateLimit({ windowMs: 60_000, limit: 30 });

  const backupLimiter = rateLimit({ windowMs: 60_000, limit: 5 });
  router.get("/settings/backup", backupLimiter, (_req, res) => {
    const dir = mkdtempSync(path.join(tmpdir(), "scout-backup-"));
    const file = path.join(dir, "app.db");
    const cleanup = () => rmSync(dir, { recursive: true, force: true });
    try {
      db.exec(`VACUUM INTO '${file}'`);
    } catch (err) {
      cleanup();
      console.error("backup failed:", err);
      return res.status(500).json({ error: "backup failed" });
    }
    res.download(file, `stash-scout-backup-${new Date().toISOString().slice(0, 10)}.db`, cleanup);
  });

  router.get("/settings", (_req, res) => {
    res.json({
      stashdbConfigured: isStashDBConfigured(cfg),
      localStashConfigured: isLocalStashConfigured(cfg),
      whisparrConfigured: isWhisparrConfigured(cfg),
      whisparrFullyConfigured: !!(cfg.whisparrRootFolderPath && typeof cfg.whisparrQualityProfileId === "number"),
    });
  });

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
      favoritesSubscribed: cfg.favoritesSubscribed ?? true,
      favoritesAutoAdd: cfg.favoritesAutoAdd ?? false,
      extraHeaderNames: Object.keys(extraHeaders(cfg)),
      authMode: cfg.authMode,
      authUsername: cfg.authUsername ?? "",
      authPasswordSet: !!cfg.authPasswordHash,
      oidcIssuer: cfg.oidcIssuer ?? "",
      oidcClientId: cfg.oidcClientId ?? "",
      oidcClientSecretSet: !!cfg.oidcClientSecret,
      oidcAllowed: cfg.oidcAllowed ?? "",
    });
  });

  router.put("/settings/config", saveLimiter, async (req, res) => {
    const patch: Record<string, unknown> = {};
    for (const field of EDITABLE_FIELDS) {
      if (field in req.body) patch[field] = req.body[field];
    }
    if (patch.extraHeaders !== undefined) {
      const parsed = parseHeaderRows(patch.extraHeaders, extraHeaders(cfg));
      if ("error" in parsed) return res.status(400).json({ error: parsed.error });
      patch.extraHeaders = parsed.block;
    }
    if (patch.authMode !== undefined && !["off", "local", "oidc"].includes(patch.authMode as string)) {
      return res.status(400).json({ error: "invalid authMode" });
    }
    if (typeof req.body.authPassword === "string" && req.body.authPassword) {
      patch.authPasswordHash = hashPassword(req.body.authPassword);
    }
    const next = { ...cfg, ...Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== "" && v !== undefined)) } as AppConfig;
    const authError = await authConfigError(next);
    if (authError) return res.status(400).json({ error: authError });
    await updateConfig(cfg, patch);
    res.status(204).end();
  });

  router.put("/settings/favorites-auto-add", saveLimiter, async (req, res) => {
    if (typeof req.body.enabled !== "boolean") return res.status(400).json({ error: "enabled must be a boolean" });
    await updateConfig(cfg, { favoritesAutoAdd: req.body.enabled });
    res.status(204).end();
  });

  router.put("/settings/favorites-subscribed", saveLimiter, async (req, res) => {
    if (typeof req.body.enabled !== "boolean") return res.status(400).json({ error: "enabled must be a boolean" });
    await updateConfig(cfg, { favoritesSubscribed: req.body.enabled });
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
