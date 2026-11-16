import type { StashDBClient } from "./stashdbClient.js";
import type { AppConfig } from "./config.js";
import type { LocalStashClient } from "./localStashClient.js";
import type { WhisparrClient } from "./whisparrClient.js";
import type { Scene } from "../shared/types.js";
import { db, filterRowToSavedFilter } from "./db.js";
import { parseStashFilter } from "./filterUtils.js";
import { fetchFilteredPage, type Orientation } from "./statusFilter.js";

const SUBSCRIBED_WINDOW_DAYS: Record<string, number> = { week: 7, month: 30, year: 365 };

export function getGlobalExcludeIds(): string[] {
  return (db.prepare("SELECT id FROM global_exclude_tags").all() as { id: string }[]).map((t) => t.id);
}

export function mergeExcludeIds(a: string[], b: string[]): string[] {
  return [...new Set([...a, ...b])];
}

export function getIgnoredIds(): Set<string> {
  return new Set((db.prepare("SELECT id FROM ignored_scenes").all() as { id: string }[]).map((s) => s.id));
}

export async function getSubscribedFeed(
  deps: { stashdb: StashDBClient; cfg: AppConfig; localStash: LocalStashClient; whisparr: WhisparrClient },
  opts: { window: string; page: number; perPage: number; refresh?: boolean; source?: string; unadded?: boolean; hide?: Orientation[]; autoAddOnly?: boolean },
): Promise<{ count: number; scenes: Scene[]; approximateCount: boolean }> {
  const { stashdb, cfg, localStash, whisparr } = deps;
  const { page, perPage, refresh = false } = opts;
  const windowDays = SUBSCRIBED_WINDOW_DAYS[opts.window] ?? SUBSCRIBED_WINDOW_DAYS.week;
  const randomize = opts.window === "month" || opts.window === "year";

  const subscribedFilters = (
    db.prepare(`SELECT * FROM filters WHERE watched = 1${opts.autoAddOnly ? " AND auto_add = 1" : ""}`).all() as any[]
  ).map(filterRowToSavedFilter);
  const useFavorites = cfg.favoritesSubscribed !== false && (!opts.autoAddOnly || !!cfg.favoritesAutoAdd);
  if (subscribedFilters.length === 0 && !useFavorites) {
    return { count: 0, scenes: [], approximateCount: false };
  }
  const globalExcludes = getGlobalExcludeIds();
  const cutoff = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  let sources = [
    ...subscribedFilters.map((f) => {
      const { input, excludeTagIds } = parseStashFilter(f.filter as Record<string, unknown>);
      input.date = { value: cutoff, modifier: "GREATER_THAN" };
      return { input, excludeTagIds: mergeExcludeIds(excludeTagIds, globalExcludes), label: f.name };
    }),
    ...(useFavorites
      ? [
          {
            input: { favorites: "PERFORMER" as const, date: { value: cutoff, modifier: "GREATER_THAN" as const } },
            excludeTagIds: globalExcludes,
            label: "Favorites",
          },
        ]
      : []),
  ];
  if (opts.source && opts.source !== "all") {
    sources = sources.filter((s) => s.label === opts.source);
  }
  const cacheKey = JSON.stringify({
    cutoff,
    globalExcludes,
    source: opts.source ?? "all",
    autoAddOnly: !!opts.autoAddOnly,
    useFavorites,
    filters: subscribedFilters.map((f) => ({ id: f.id, filter: f.filter })),
  });
  const ignoredIds = getIgnoredIds();

  const reseed = (randomize && page === 1) || refresh;
  let pendingReset = reseed;
  let pendingBypass = refresh;
  const unadded = opts.unadded !== false;
  return fetchFilteredPage(
    cfg,
    { localStash, whisparr },
    (rawPage, pp) => {
      const reset = pendingReset;
      pendingReset = false;
      const bypassCache = pendingBypass;
      pendingBypass = false;
      return stashdb.queryMergedFeed(sources, rawPage, pp, cacheKey, new Set(), { randomize, reset, bypassCache });
    },
    page,
    perPage,
    JSON.stringify({ route: "subscribed", cacheKey, unadded, hide: opts.hide ?? [] }),
    { requireUnadded: unadded, excludeIds: ignoredIds, hide: opts.hide, bypassCache: reseed },
  );
}
