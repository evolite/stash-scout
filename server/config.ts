export interface AppConfig {
  port: number;
  stashdbUrl: string;
  stashdbApiKey: string;
  localStashUrl?: string;
  localStashApiKey?: string;
  localStashRootUrl?: string;
  whisparrBaseUrl?: string;
  whisparrApiKey?: string;
  whisparrRootFolderPath?: string;
  whisparrQualityProfileId?: number;
  cfAccessClientId?: string;
  cfAccessClientSecret?: string;
}

function env(name: string): string | undefined {
  const v = process.env[name];
  return v && v.trim() !== "" ? v.trim() : undefined;
}

export function loadConfig(): AppConfig {
  const stashdbApiKey = env("STASHDB_API_KEY");
  if (!stashdbApiKey) {
    throw new Error("STASHDB_API_KEY is required (see .env.example)");
  }
  const qualityProfileId = env("WHISPARR_QUALITY_PROFILE_ID");
  return {
    port: Number(env("PORT") ?? 8787),
    stashdbUrl: env("STASHDB_URL") ?? "https://stashdb.org/graphql",
    stashdbApiKey,
    localStashUrl: env("LOCAL_STASH_URL"),
    localStashApiKey: env("LOCAL_STASH_API_KEY"),
    localStashRootUrl: env("LOCAL_STASH_ROOT_URL"),
    whisparrBaseUrl: env("WHISPARR_BASE_URL"),
    whisparrApiKey: env("WHISPARR_API_KEY"),
    whisparrRootFolderPath: env("WHISPARR_ROOT_FOLDER_PATH"),
    whisparrQualityProfileId: qualityProfileId ? Number(qualityProfileId) : undefined,
    cfAccessClientId: env("CF_ACCESS_CLIENT_ID"),
    cfAccessClientSecret: env("CF_ACCESS_CLIENT_SECRET"),
  };
}

export function isLocalStashConfigured(cfg: AppConfig): boolean {
  return !!(cfg.localStashUrl && cfg.localStashApiKey);
}

export function isWhisparrConfigured(cfg: AppConfig): boolean {
  return !!(cfg.whisparrBaseUrl && cfg.whisparrApiKey);
}
