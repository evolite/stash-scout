export interface AppConfig {
  port: number;
  stashdbUrl: string;
  stashdbApiKey?: string;
  localStashUrl?: string;
  localStashApiKey?: string;
  localStashRootUrl?: string;
  whisparrBaseUrl?: string;
  whisparrApiKey?: string;
  whisparrRootFolderPath?: string;
  whisparrQualityProfileId?: number;
  favoritesSubscribed?: boolean; // Favorites feed source on/off (default on)
  favoritesAutoAdd?: boolean; // hourly job also adds new releases from StashDB favorite performers
  extraHeaders?: string; // "Name: value" per line, sent to local Stash + Whisparr (e.g. auth proxy creds)
  authMode: "off" | "local" | "oidc";
  authUsername?: string;
  authPasswordHash?: string; // scrypt "salt:hash" (hex), never plaintext
  oidcIssuer?: string;
  oidcClientId?: string;
  oidcClientSecret?: string;
  oidcAllowed?: string; // optional: only this email/sub may log in
}

export function isStashDBConfigured(cfg: AppConfig): boolean {
  return !!cfg.stashdbApiKey;
}

export function isLocalStashConfigured(cfg: AppConfig): boolean {
  return !!(cfg.localStashUrl && cfg.localStashApiKey);
}

export function isWhisparrConfigured(cfg: AppConfig): boolean {
  return !!(cfg.whisparrBaseUrl && cfg.whisparrApiKey);
}

export const HEADER_NAME = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;

// Parses the extraHeaders block; blank and malformed lines are skipped.
export function extraHeaders(cfg: AppConfig): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of (cfg.extraHeaders ?? "").split("\n")) {
    const i = line.indexOf(":");
    const name = line.slice(0, i).trim();
    if (i < 0 || !HEADER_NAME.test(name)) continue;
    out[name] = line.slice(i + 1).trim();
  }
  return out;
}
