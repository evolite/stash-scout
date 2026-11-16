import { db } from "./db.js";
import { encrypt, decrypt } from "./secretStore.js";
import type { AppConfig } from "./config.js";
import { hashPassword } from "./auth.js";

interface StoredSettings {
  stashdbUrl?: string;
  stashdbApiKey?: string;
  localStashUrl?: string;
  localStashApiKey?: string;
  localStashRootUrl?: string;
  whisparrBaseUrl?: string;
  whisparrApiKey?: string;
  whisparrRootFolderPath?: string;
  whisparrQualityProfileId?: number;
  favoritesSubscribed?: boolean;
  favoritesAutoAdd?: boolean;
  extraHeaders?: string;
  cfAccessClientId?: string;
  cfAccessClientSecret?: string;
  authMode?: AppConfig["authMode"];
  authUsername?: string;
  authPasswordHash?: string;
  oidcIssuer?: string;
  oidcClientId?: string;
  oidcClientSecret?: string;
  oidcAllowed?: string;
}

function readSettings(): StoredSettings | null {
  const row = db.prepare("SELECT value FROM settings WHERE key = 'config'").get() as { value: string } | undefined;
  return row ? JSON.parse(row.value) : null;
}

function writeSettings(settings: StoredSettings): void {
  db.prepare("INSERT INTO settings (key, value) VALUES ('config', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(
    JSON.stringify(settings),
  );
}

function envFallback(name: string): string | undefined {
  const v = process.env[name];
  return v?.trim() || undefined;
}

async function persist(cfg: AppConfig): Promise<void> {
  const toStore: StoredSettings = {
    stashdbUrl: cfg.stashdbUrl,
    localStashUrl: cfg.localStashUrl,
    localStashRootUrl: cfg.localStashRootUrl,
    whisparrBaseUrl: cfg.whisparrBaseUrl,
    whisparrRootFolderPath: cfg.whisparrRootFolderPath,
    whisparrQualityProfileId: cfg.whisparrQualityProfileId,
    favoritesSubscribed: cfg.favoritesSubscribed,
    favoritesAutoAdd: cfg.favoritesAutoAdd,
    authMode: cfg.authMode,
    authUsername: cfg.authUsername,
    authPasswordHash: cfg.authPasswordHash,
    oidcIssuer: cfg.oidcIssuer,
    oidcClientId: cfg.oidcClientId,
    oidcAllowed: cfg.oidcAllowed,
  };
  if (cfg.stashdbApiKey) toStore.stashdbApiKey = await encrypt(cfg.stashdbApiKey);
  if (cfg.localStashApiKey) toStore.localStashApiKey = await encrypt(cfg.localStashApiKey);
  if (cfg.whisparrApiKey) toStore.whisparrApiKey = await encrypt(cfg.whisparrApiKey);
  if (cfg.extraHeaders) toStore.extraHeaders = await encrypt(cfg.extraHeaders);
  if (cfg.oidcClientSecret) toStore.oidcClientSecret = await encrypt(cfg.oidcClientSecret);
  writeSettings(toStore);
}

async function readSecret(field: string, stored: string | undefined, fallback: string | undefined): Promise<string | undefined> {
  if (!stored) return fallback;
  try {
    return await decrypt(stored);
  } catch {
    console.warn(`Could not decrypt stored ${field} (missing or different .secret-key?) — re-enter it in Settings.`);
    return fallback;
  }
}

export async function loadInitialConfig(): Promise<AppConfig> {
  const stored = readSettings();
  const isFirstBoot = stored === null;
  const s = stored ?? {};

  const cfg: AppConfig = {
    port: Number(envFallback("PORT") ?? 8787),
    stashdbUrl: s.stashdbUrl ?? envFallback("STASHDB_URL") ?? "https://stashdb.org/graphql",
    stashdbApiKey: await readSecret("stashdbApiKey", s.stashdbApiKey, envFallback("STASHDB_API_KEY")),
    localStashUrl: s.localStashUrl ?? envFallback("LOCAL_STASH_URL"),
    localStashApiKey: await readSecret("localStashApiKey", s.localStashApiKey, envFallback("LOCAL_STASH_API_KEY")),
    localStashRootUrl: s.localStashRootUrl ?? envFallback("LOCAL_STASH_ROOT_URL"),
    whisparrBaseUrl: s.whisparrBaseUrl ?? envFallback("WHISPARR_BASE_URL"),
    whisparrApiKey: await readSecret("whisparrApiKey", s.whisparrApiKey, envFallback("WHISPARR_API_KEY")),
    whisparrRootFolderPath: s.whisparrRootFolderPath ?? envFallback("WHISPARR_ROOT_FOLDER_PATH"),
    whisparrQualityProfileId:
      s.whisparrQualityProfileId ?? (envFallback("WHISPARR_QUALITY_PROFILE_ID") ? Number(envFallback("WHISPARR_QUALITY_PROFILE_ID")) : undefined),
    favoritesSubscribed: s.favoritesSubscribed ?? true,
    favoritesAutoAdd: s.favoritesAutoAdd ?? (envFallback("FAVORITES_AUTO_ADD") === "true"),
    extraHeaders: await readSecret("extraHeaders", s.extraHeaders, undefined),
    authMode: (envFallback("AUTH_MODE_FORCE") === "off" ? "off" : s.authMode) ?? (envFallback("AUTH_MODE") as AppConfig["authMode"] | undefined) ?? "off",
    authUsername: s.authUsername ?? envFallback("AUTH_USERNAME"),
    authPasswordHash: s.authPasswordHash ?? (envFallback("AUTH_PASSWORD") ? hashPassword(envFallback("AUTH_PASSWORD")!) : undefined),
    oidcIssuer: s.oidcIssuer ?? envFallback("OIDC_ISSUER"),
    oidcClientId: s.oidcClientId ?? envFallback("OIDC_CLIENT_ID"),
    oidcClientSecret: await readSecret("oidcClientSecret", s.oidcClientSecret, envFallback("OIDC_CLIENT_SECRET")),
    oidcAllowed: s.oidcAllowed ?? envFallback("OIDC_ALLOWED"),
  };

  let migrated = false;
  if (!s.extraHeaders) {
    const cfId = s.cfAccessClientId ?? envFallback("CF_ACCESS_CLIENT_ID");
    const cfSecret = await readSecret("cfAccessClientSecret", s.cfAccessClientSecret, envFallback("CF_ACCESS_CLIENT_SECRET"));
    if (cfId && cfSecret) {
      cfg.extraHeaders = `CF-Access-Client-Id: ${cfId}\nCF-Access-Client-Secret: ${cfSecret}`;
      migrated = true;
    }
  }

  if (isFirstBoot || migrated) await persist(cfg);

  return cfg;
}

export async function updateConfig(cfg: AppConfig, patch: Record<string, unknown>): Promise<void> {
  for (const [key, value] of Object.entries(patch)) {
    if (value === null) {
      (cfg as any)[key] = undefined;
    } else if (value === undefined || value === "") {
      continue;
    } else if (key === "whisparrQualityProfileId") {
      (cfg as any)[key] = Number(value);
    } else {
      (cfg as any)[key] = value;
    }
  }
  await persist(cfg);
}
