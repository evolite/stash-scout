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
  cfAccessClientId?: string;
  cfAccessClientSecret?: string;
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
