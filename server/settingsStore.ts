import { readJson, writeJson } from "./store.js";
import { encrypt, decrypt } from "./secretStore.js";
import type { AppConfig } from "./config.js";

interface StoredSettings {
  stashdbUrl?: string;
  stashdbApiKey?: string; // encrypted
  localStashUrl?: string;
  localStashApiKey?: string; // encrypted
  localStashRootUrl?: string;
  whisparrBaseUrl?: string;
  whisparrApiKey?: string; // encrypted
  whisparrRootFolderPath?: string;
  whisparrQualityProfileId?: number;
  cfAccessClientId?: string;
  cfAccessClientSecret?: string; // encrypted
}

const FILE = "settings.json";

function envFallback(name: string): string | undefined {
  const v = process.env[name];
  return v && v.trim() ? v.trim() : undefined;
}

async function persist(cfg: AppConfig): Promise<void> {
  const toStore: StoredSettings = {
    stashdbUrl: cfg.stashdbUrl,
    localStashUrl: cfg.localStashUrl,
    localStashRootUrl: cfg.localStashRootUrl,
    whisparrBaseUrl: cfg.whisparrBaseUrl,
    whisparrRootFolderPath: cfg.whisparrRootFolderPath,
    whisparrQualityProfileId: cfg.whisparrQualityProfileId,
    cfAccessClientId: cfg.cfAccessClientId,
  };
  if (cfg.stashdbApiKey) toStore.stashdbApiKey = await encrypt(cfg.stashdbApiKey);
  if (cfg.localStashApiKey) toStore.localStashApiKey = await encrypt(cfg.localStashApiKey);
  if (cfg.whisparrApiKey) toStore.whisparrApiKey = await encrypt(cfg.whisparrApiKey);
  if (cfg.cfAccessClientSecret) toStore.cfAccessClientSecret = await encrypt(cfg.cfAccessClientSecret);
  await writeJson(FILE, toStore);
}

// PORT stays an env var (infra concern, not something you'd edit via the app UI
// while the app is already listening on it) — everything else configurable and
// testable moves here.
export async function loadInitialConfig(): Promise<AppConfig> {
  const stored = await readJson<StoredSettings | null>(FILE, null);
  const isFirstBoot = stored === null;
  const s = stored ?? {};

  const cfg: AppConfig = {
    port: Number(envFallback("PORT") ?? 8787),
    stashdbUrl: s.stashdbUrl ?? envFallback("STASHDB_URL") ?? "https://stashdb.org/graphql",
    stashdbApiKey: s.stashdbApiKey ? await decrypt(s.stashdbApiKey) : envFallback("STASHDB_API_KEY"),
    localStashUrl: s.localStashUrl ?? envFallback("LOCAL_STASH_URL"),
    localStashApiKey: s.localStashApiKey ? await decrypt(s.localStashApiKey) : envFallback("LOCAL_STASH_API_KEY"),
    localStashRootUrl: s.localStashRootUrl ?? envFallback("LOCAL_STASH_ROOT_URL"),
    whisparrBaseUrl: s.whisparrBaseUrl ?? envFallback("WHISPARR_BASE_URL"),
    whisparrApiKey: s.whisparrApiKey ? await decrypt(s.whisparrApiKey) : envFallback("WHISPARR_API_KEY"),
    whisparrRootFolderPath: s.whisparrRootFolderPath ?? envFallback("WHISPARR_ROOT_FOLDER_PATH"),
    whisparrQualityProfileId:
      s.whisparrQualityProfileId ?? (envFallback("WHISPARR_QUALITY_PROFILE_ID") ? Number(envFallback("WHISPARR_QUALITY_PROFILE_ID")) : undefined),
    cfAccessClientId: s.cfAccessClientId ?? envFallback("CF_ACCESS_CLIENT_ID"),
    cfAccessClientSecret: s.cfAccessClientSecret ? await decrypt(s.cfAccessClientSecret) : envFallback("CF_ACCESS_CLIENT_SECRET"),
  };

  // One-time migration: if this is the first boot after upgrading and .env had
  // values, persist them encrypted now so future boots don't depend on .env —
  // from here on the Settings UI is the source of truth.
  if (isFirstBoot) await persist(cfg);

  return cfg;
}

// Mutates the live config object in place (rather than replacing it) so every
// client already holding a reference to it — StashDBClient, WhisparrClient,
// etc. — picks up the change immediately, no restart required.
export async function updateConfig(cfg: AppConfig, patch: Record<string, unknown>): Promise<void> {
  for (const [key, value] of Object.entries(patch)) {
    if (value === null) {
      (cfg as any)[key] = undefined;
    } else if (value === undefined || value === "") {
      // omitted/blank = leave existing value untouched (so secrets don't need
      // to be re-entered just to change an unrelated field)
      continue;
    } else if (key === "whisparrQualityProfileId") {
      (cfg as any)[key] = Number(value);
    } else {
      (cfg as any)[key] = value;
    }
  }
  await persist(cfg);
}
