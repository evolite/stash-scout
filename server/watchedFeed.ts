import type { StashDBClient } from "./stashdbClient.js";
import type { AppConfig } from "./config.js";
import type { LocalStashClient } from "./localStashClient.js";
import type { WhisparrClient } from "./whisparrClient.js";
import type { Scene } from "../shared/types.js";
import { db, filterRowToSavedFilter } from "./db.js";
import { parseStashFilter } from "./filterUtils.js";
import { fetchFilteredPage, type Orientation } from "./statusFilter.js";

const WATCHED_WINDOW_DAYS: Record<string, number> = { week: 7, month: 30, year: 365 };

export function getGlobalExcludeIds(): string[] {
  return (db.prepare("SELECT id FROM global_exclude_tags").all() as { id: string }[]).map((t) => t.id);
}

export function mergeExcludeIds(a: string[], b: string[]): string[] {
  return [...new Set([...a, ...b])];
}

export function getIgnoredIds(): Set<string> {
  return new Set((db.prepare("SELECT id FROM ignored_scenes").all() as { id: string }[]).map((s) => s.id));
}

// Shared by the JSON /watched-feed route (paginated, for the frontend grid) and
// the RSS feed route (single large page, for Whisparr's RSS import list) — both
// need the exact same "merge every watched filter + Favorites, windowed,
// deduped, unadded-only" result, just rendered differently.
export async function getWatchedFeed(
  deps: { stashdb: StashDBClient; cfg: AppConfig; localStash: LocalStashClient; whisparr: WhisparrClient },
  opts: { window: string; page: number; perPage: number; refresh?: boolean; source?: string; unadded?: boolean; hide?: Orientation[] },
): Promise<{ count: number; scenes: Scene[]; approximateCount: boolean }> {
  const { stashdb, cfg, localStash, whisparr } = deps;
  const { page, perPage, refresh = false } = opts;
  const windowDays = WATCHED_WINDOW_DAYS[opts.window] ?? WATCHED_WINDOW_DAYS.week;
  // Month/year are long enough spans that date order goes stale fast — randomize
  // instead, reshuffling on every fresh page-1 visit (see queryMergedFeed).
  const randomize = opts.window === "month" || opts.window === "year";

  const watchedFilters = (db.prepare("SELECT * FROM filters WHERE watched = 1").all() as any[]).map(filterRowToSavedFilter);
  const globalExcludes = getGlobalExcludeIds();
  const cutoff = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  let sources = [
    ...watchedFilters.map((f) => {
      const { input, excludeTagIds } = parseStashFilter(f.filter as Record<string, unknown>);
      input.date = { value: cutoff, modifier: "GREATER_THAN" };
      return { input, excludeTagIds: mergeExcludeIds(excludeTagIds, globalExcludes), label: f.name };
    }),
    {
      input: { favorites: "PERFORMER" as const, date: { value: cutoff, modifier: "GREATER_THAN" as const } },
      excludeTagIds: globalExcludes,
      label: "Favorites",
    },
  ];
  // The New Releases filter-name chip bar narrows to a single source's matches
  // instead of the full merge — "all" (or no source) keeps every source active.
  if (opts.source && opts.source !== "all") {
    sources = sources.filter((s) => s.label === opts.source);
  }
  // cutoff (changes daily) and the global excludes are folded into the cache
  // key so the window rolls forward and a Settings change is picked up
  // immediately instead of serving a stale cached merge.
  const cacheKey = JSON.stringify({
    cutoff,
    globalExcludes,
    source: opts.source ?? "all",
    filters: watchedFilters.map((f) => ({ id: f.id, filter: f.filter })),
  });
  const ignoredIds = getIgnoredIds();

  // Only the *first* internal round of this request should trigger a reseed —
  // fetchFilteredPage may call queryMergedFeed several times per request as it
  // pages through raw results, and re-deleting the cache on every one of those
  // internal calls would wipe out progress made by the previous call.
  const reseed = (randomize && page === 1) || refresh;
  let pendingReset = reseed;
  const unadded = opts.unadded !== false;
  return fetchFilteredPage(
    cfg,
    localStash,
    whisparr,
    (rawPage, pp) => {
      const reset = pendingReset;
      pendingReset = false;
      // Ignored scenes are dropped by fetchFilteredPage instead — filtering
      // them here would shift raw page boundaries under its cursor.
      return stashdb.queryMergedFeed(sources, rawPage, pp, cacheKey, new Set(), { randomize, reset, bypassCache: refresh });
    },
    page,
    perPage,
    JSON.stringify({ route: "watched", cacheKey, unadded, hide: opts.hide ?? [] }),
    { requireUnadded: unadded, excludeIds: ignoredIds, hide: opts.hide, bypassCache: reseed },
  );
}
