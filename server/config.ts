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
