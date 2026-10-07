import { randomInt } from "node:crypto";
import type { AppConfig } from "./config.js";
import type { Scene, PerformerDetails, StudioDetails, PerformerResult } from "../shared/types.js";
import { capMap } from "./cacheUtil.js";

// StashDB's schema only has one `tags` filter (no separate exclude_tags field) — an
// EXCLUDES modifier query and an INCLUDES/INCLUDES_ALL query are mutually exclusive,
// so "include these AND exclude those" needs two requests intersected client-side.
// v1 exposes a single tags criterion (one modifier at a time) to match what the API
// actually supports in one call; combined include+exclude is a documented v2 gap.
type SetModifier = "INCLUDES" | "INCLUDES_ALL" | "EXCLUDES";

export interface SceneQueryInput {
  text?: string;
  tags?: { value: string[]; modifier: SetModifier };
  performers?: { value: string[]; modifier: SetModifier };
  studios?: { value: string[]; modifier: SetModifier };
  date?: { value: string; modifier: "EQUALS" | "GREATER_THAN" | "LESS_THAN" };
  favorites?: "PERFORMER" | "STUDIO" | "ALL";
  page: number;
  per_page: number;
  sort: string;
  direction: string;
}

// The "Discover performers" filter is split in two: `PerformerQueryInput` is
// what StashDB's queryPerformers resolver actually honours; everything else
// (eye/hair colour, height, cup size, tattoos, piercings) is a
// `PerformerClientCriteria` we apply ourselves by paging + filtering StashDB's
// results — its schema advertises those criteria but the server silently
// ignores them.
export interface PerformerQueryInput {
  name?: string;
  gender?: string;
  ethnicity?: string;
  country?: { value: string; modifier: string };
  birth_year?: { value: number; modifier: string };
  is_favorite?: boolean;
  page: number;
  per_page: number;
  sort: string;
  direction: string;
}

// Applied client-side (see queryPerformers). height.modifier is GREATER_THAN
// (≥), LESS_THAN (≤) or EQUALS; the colour/cup fields are exact enum matches.
export interface PerformerClientCriteria {
  eye_color?: string;
  hair_color?: string;
  // modifier GREATER_THAN (cup ≥), LESS_THAN (cup ≤) or EQUALS; compared as
  // upper-cased strings, which orders A<B<…<DD<E correctly enough.
  cup_size?: { value: string; modifier: string };
  height?: { value: number; modifier: string };
  hasTattoos?: boolean; // true = has ≥1, false = has none
  hasPiercings?: boolean;
}

const PERFORMER_FIELDS = `
  id
  name
  disambiguation
  gender
  birth_date
  age
  country
  ethnicity
  eye_color
  hair_color
  height
  cup_size
  career_start_year
  career_end_year
  scene_count
  images { url width height }
  tattoos { location description }
  piercings { location description }
`;

function performerHasCriteria(c: PerformerClientCriteria): boolean {
  return !!(c.eye_color || c.hair_color || c.cup_size || c.height) || c.hasTattoos !== undefined || c.hasPiercings !== undefined;
}

// Does `actual` fail the `modifier` comparison against `target`? LESS_THAN
// means actual must be ≤ target, EQUALS exact, anything else ≥ (GREATER_THAN).
// Strings compare lexically (upper-cased cup sizes: A<B<…<DD<E).
function failsModifier<T extends number | string>(actual: T, target: T, modifier: string): boolean {
  if (modifier === "LESS_THAN") return actual > target;
  if (modifier === "EQUALS") return actual !== target;
  return actual < target;
}

function performerMatchesCriteria(p: PerformerResult, c: PerformerClientCriteria): boolean {
  const eq = (a: string | null, b: string) => (a ?? "").toUpperCase() === b.toUpperCase();
  const has = (list: unknown[] | null | undefined) => list != null && list.length > 0;
  if (c.eye_color && !eq(p.eye_color, c.eye_color)) return false;
  if (c.hair_color && !eq(p.hair_color, c.hair_color)) return false;
  if (c.cup_size) {
    const a = (p.cup_size ?? "").toUpperCase();
    if (!a || failsModifier(a, c.cup_size.value.toUpperCase(), c.cup_size.modifier)) return false;
  }
  if (c.height) {
    if (p.height == null || failsModifier(p.height, c.height.value, c.height.modifier)) return false;
  }
  if (c.hasTattoos !== undefined && has(p.tattoos) !== c.hasTattoos) return false;
  if (c.hasPiercings !== undefined && has(p.piercings) !== c.hasPiercings) return false;
  return true;
}

const SCENE_FIELDS = `
  id
  title
  release_date
  duration
  studio { id name }
  tags { id name }
  images { id url width height }
  performers { performer { id name gender } as }
`;

const MAX_PER_PAGE = 40;
const MAX_LOOKUP_IDS = 100;

// A hung/unresponsive StashDB otherwise leaves fetch() pending indefinitely —
// Node's fetch has no default timeout — pinning the request handler open.
const FETCH_TIMEOUT_MS = 15_000;

// Hard backstop against StashDB's rate limit: no more than STASHDB_MAX_RPM requests
// leave this process in any rolling 60s window, queued (not dropped) beyond that.
// This bounds the worst case regardless of what any given feature does above it.
const MAX_REQUESTS_PER_MINUTE = Number(process.env.STASHDB_MAX_RPM ?? 30);
const requestTimestamps: number[] = [];
let queue: Promise<void> = Promise.resolve();

function throttle(): Promise<void> {
  const run = queue.then(async () => {
    const now = Date.now();
    while (requestTimestamps.length && now - requestTimestamps[0] > 60_000) requestTimestamps.shift();
    if (requestTimestamps.length >= MAX_REQUESTS_PER_MINUTE) {
      const waitMs = 60_000 - (now - requestTimestamps[0]) + 50;
      await new Promise((r) => setTimeout(r, Math.max(0, waitMs)));
    }
    requestTimestamps.push(Date.now());
  });
  queue = run;
  return run;
}

// Short-lived cache so repeated identical queries (page revisits, the exclude-tags
// scan below, a re-render firing the same fetch twice) don't cost a fresh call.
const CACHE_TTL_MS = 20_000;
const RESPONSE_CACHE_MAX_ENTRIES = 1000;
const responseCache = new Map<string, { at: number; expiresAt: number; data: unknown }>();
// Collapses identical queries issued while one is already in flight (a
// reset()+load() race in the UI, parallel merged-feed sources that resolve to
// the same query) down to a single upstream request.
const inflight = new Map<string, Promise<unknown>>();

async function gql<T>(
  url: string,
  apiKey: string | undefined,
  query: string,
  variables: unknown,
  bypassCache = false,
  ttlMs = CACHE_TTL_MS,
): Promise<T> {
  if (!apiKey) {
    throw new Error("StashDB is not configured — add an API key in Settings.");
  }
  const cacheKey = query + JSON.stringify(variables);
  const cached = responseCache.get(cacheKey);
  if (!bypassCache && cached && Date.now() < cached.expiresAt) {
    return cached.data as T;
  }
  if (!bypassCache) {
    const pending = inflight.get(cacheKey);
    if (pending) return pending as Promise<T>;
  }

  const run = (async (): Promise<T> => {
    await throttle();
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ApiKey: apiKey },
      body: JSON.stringify({ query, variables }),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) {
      throw new Error(`StashDB request failed: HTTP ${res.status}`);
    }
    const json = (await res.json()) as { data?: T; errors?: { message: string }[] };
    if (json.errors?.length) {
      throw new Error(`StashDB GraphQL error: ${json.errors.map((e) => e.message).join("; ")}`);
    }
    responseCache.set(cacheKey, { at: Date.now(), expiresAt: Date.now() + ttlMs, data: json.data });
    capMap(responseCache, RESPONSE_CACHE_MAX_ENTRIES);
    return json.data as T;
  })().finally(() => inflight.delete(cacheKey));

  inflight.set(cacheKey, run);
  return run;
}

// Per-filter accumulated results for exclude-tag queries — keyed on the filter
// (minus page), so "next page" reuses previously-fetched StashDB pages instead
// of rescanning. Capped in size and lifetime to bound memory and staleness.
const EXCLUDE_CACHE_TTL_MS = 5 * 60_000;
// StashDB pages fetched per call; the per-filter cache persists, so a deep or
// heavily-excluded page resumes the scan on the next call instead of stopping
// at a fixed total.
const SCENE_SCAN_BUDGET = Number(process.env.STASHDB_SCENE_SCAN_BUDGET ?? 5);
interface ExcludeCacheEntry {
  scenes: Scene[];
  exhausted: boolean;
  internalPage: number;
  at: number;
}
const FILTER_CACHE_MAX_ENTRIES = 200;
const excludeCache = new Map<string, ExcludeCacheEntry>();

// Same idea as excludeCache, for attribute-filtered performer discovery — page
// through queryPerformers and keep only the performers matching the client-side
// criteria, cached per filter so paging forward reuses earlier fetches.
const MAX_CACHED_PERFORMERS = Number(process.env.STASHDB_MAX_CACHED_PERFORMERS ?? 300);
// A rare-attribute filter (e.g. RED eyes) could otherwise page the entire
// ~100k-performer catalogue at the 30 req/min rate limit — over an hour of
// fetches for one request. Cap the StashDB pages scanned per request; the
// per-filter cache persists, so paging forward resumes the scan where it left
// off rather than restarting.
const PERFORMER_SCAN_BUDGET = Number(process.env.STASHDB_PERFORMER_SCAN_BUDGET ?? 12);
interface PerformerFilterCacheEntry {
  performers: PerformerResult[];
  exhausted: boolean;
  internalPage: number;
  at: number;
}
const performerFilterCache = new Map<string, PerformerFilterCacheEntry>();

// "Random" charts mode — see queryScenesRandomWindow below. Bounded to
// 2010-01-01 onward: StashDB's pre-2010 catalog is thin enough that a
// uniform pick further back mostly lands on a near-empty window.
const RANDOM_WINDOW_DAYS = 61; // ~2 months
const RANDOM_WINDOW_RANGE_START = new Date("2010-01-01T00:00:00Z").getTime();
const RANDOM_WINDOW_TTL_MS = 5 * 60_000;
interface RandomWindowEntry {
  scenes: Scene[];
  exhausted: boolean;
  internalPage: number;
  at: number;
  start: string;
  end: string;
}
const randomWindowCache = new Map<string, RandomWindowEntry>();

// Merged "subscribed filters" feed — same idea as excludeCache but fanning out to
// several source filters, deduping by scene id, and keeping each source's own
// page cursor so growing the feed doesn't restart every source from page 1.
//
// The output round-robins one scene from each source per fetch round, appended
// directly to a single flat `merged` list as they're found (rather than kept
// per-source and re-interleaved by array position on every read). A pure global
// date sort would let one prolific filter's results fill the entire visible page
// before a rarer filter's results ever surfaced — round-robin guarantees every
// subscribed filter gets representation. Appending directly (instead of recomputing
// row-by-row from each source's current length) matters because a slower source
// growing between two page fetches would otherwise retroactively fill earlier
// "rows", shifting every later position and re-serving a scene already sent on a
// previous page.
const MERGED_FEED_TTL_MS = 5 * 60_000;
const MAX_MERGE_ROUNDS = 3;
interface MergedFeedEntry {
  merged: Scene[];
  seen: Set<string>;
  cursors: { internalPage: number; exhausted: boolean }[];
  exhaustedAll: boolean;
  at: number;
}
const mergedFeedCache = new Map<string, MergedFeedEntry>();

// Fisher-Yates, in place.
function shuffle<T>(arr: T[]): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = randomInt(0, i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

export class StashDBClient {
  constructor(private readonly cfg: AppConfig) {}

  async queryScenes(input: Partial<SceneQueryInput>, bypassCache = false): Promise<{ count: number; scenes: Scene[] }> {
    const variables = {
      input: {
        ...input,
        page: input.page ?? 1,
        per_page: Math.min(input.per_page ?? 25, MAX_PER_PAGE),
        sort: input.sort ?? "DATE",
        direction: input.direction ?? "DESC",
      },
    };
    const data = await gql<{ queryScenes: { count: number; scenes: Scene[] } }>(
      this.cfg.stashdbUrl,
      this.cfg.stashdbApiKey,
      `query ($input: SceneQueryInput!) {
        queryScenes(input: $input) {
          count
          scenes { ${SCENE_FIELDS} }
        }
      }`,
      variables,
      bypassCache,
      60_000, // scene data barely changes minute-to-minute; feeds it into the 5-min exclude/merged caches
    );
    return data.queryScenes;
  }

  private async rawQueryPerformers(
    input: Partial<PerformerQueryInput>,
    bypassCache: boolean,
  ): Promise<{ count: number; performers: PerformerResult[] }> {
    const data = await gql<{ queryPerformers: { count: number; performers: PerformerResult[] } }>(
      this.cfg.stashdbUrl,
      this.cfg.stashdbApiKey,
      `query ($input: PerformerQueryInput!) {
        queryPerformers(input: $input) {
          count
          performers { ${PERFORMER_FIELDS} }
        }
      }`,
      {
        input: {
          ...input,
          page: input.page ?? 1,
          per_page: Math.min(input.per_page ?? 25, MAX_PER_PAGE),
          sort: input.sort ?? "SCENE_COUNT",
          direction: input.direction ?? "DESC",
        },
      },
      bypassCache,
      60_000,
    );
    return data.queryPerformers;
  }

  // Attribute-filtered performer discovery (Filters → Performers). `input` is
  // the part StashDB filters natively; `criteria` (eye/hair colour, height, cup
  // size, tattoos, piercings) is applied here by paging through StashDB's
  // results in the requested sort order and keeping only the matches —
  // accumulated into a per-filter cache like queryScenesExcluding, capped at
  // MAX_CACHED_PERFORMERS so a very selective filter comes back
  // short/approximate rather than scanning the whole catalogue.
  async queryPerformers(
    input: Partial<PerformerQueryInput>,
    criteria: PerformerClientCriteria = {},
    bypassCache = false,
  ): Promise<{ count: number; performers: PerformerResult[]; approximateCount: boolean }> {
    const perPage = Math.min(input.per_page ?? 25, MAX_PER_PAGE);
    const page = input.page ?? 1;

    if (!performerHasCriteria(criteria)) {
      const data = await this.rawQueryPerformers({ ...input, page, per_page: perPage }, bypassCache);
      return { ...data, approximateCount: false };
    }

    const skip = (page - 1) * perPage;
    const key = JSON.stringify({ ...input, page: undefined, per_page: undefined, criteria });
    if (bypassCache) performerFilterCache.delete(key);
    let entry = performerFilterCache.get(key);
    if (!entry || Date.now() - entry.at > EXCLUDE_CACHE_TTL_MS) {
      entry = { performers: [], exhausted: false, internalPage: 1, at: Date.now() };
      performerFilterCache.set(key, entry);
      capMap(performerFilterCache, FILTER_CACHE_MAX_ENTRIES);
    }

    let scannedThisRequest = 0;
    while (
      entry.performers.length < skip + perPage &&
      !entry.exhausted &&
      entry.performers.length < MAX_CACHED_PERFORMERS &&
      scannedThisRequest < PERFORMER_SCAN_BUDGET
    ) {
      const { performers } = await this.rawQueryPerformers(
        { ...input, page: entry.internalPage, per_page: MAX_PER_PAGE },
        bypassCache,
      );
      scannedThisRequest++;
      for (const p of performers) if (performerMatchesCriteria(p, criteria)) entry.performers.push(p);
      if (performers.length < MAX_PER_PAGE) entry.exhausted = true;
      else entry.internalPage++;
    }

    return {
      // Always the count actually matched so far — while not exhausted it's a
      // lower bound (approximateCount tells the UI more may follow). StashDB's
      // own total is meaningless here since it ignores the attribute criteria.
      count: entry.performers.length,
      performers: entry.performers.slice(skip, skip + perPage),
      approximateCount: !entry.exhausted,
    };
  }

  // StashDB has no "include tag A, exclude tag B" query — its `tags` filter takes
  // one modifier. We fake it server-side: page through StashDB's results (which
  // already include each scene's full tag list), drop scenes carrying an excluded
  // tag, and keep the accumulated result *cached per filter* (not per page) so
  // paging forward through the browser reuses what's already been fetched instead
  // of re-scanning from page 1 every time. Each call fetches at most SCENE_SCAN_BUDGET
  // pages — we're rate-limited by StashDB, so a heavily-excluded or very deep
  // query comes back short/approximate and resumes on the next call.
  async queryScenesExcluding(
    input: Partial<SceneQueryInput>,
    excludeTagIds: string[],
    bypassCache = false,
  ): Promise<{ count: number; scenes: Scene[]; approximateCount: boolean }> {
    const perPage = Math.min(input.per_page ?? 25, MAX_PER_PAGE);
    const page = input.page ?? 1;
    const skip = (page - 1) * perPage;

    const key = JSON.stringify({ ...input, page: undefined, per_page: undefined, excludeTagIds: [...excludeTagIds].sort((a, b) => a.localeCompare(b)) });
    if (bypassCache) excludeCache.delete(key);
    let entry = excludeCache.get(key);
    if (!entry || Date.now() - entry.at > EXCLUDE_CACHE_TTL_MS) {
      entry = { scenes: [], exhausted: false, internalPage: 1, at: Date.now() };
      excludeCache.set(key, entry);
      capMap(excludeCache, FILTER_CACHE_MAX_ENTRIES);
    }
    const excludeSet = new Set(excludeTagIds);

    for (let fetched = 0; entry.scenes.length < skip + perPage && !entry.exhausted && fetched < SCENE_SCAN_BUDGET; fetched++) {
      const { scenes } = await this.queryScenes({ ...input, page: entry.internalPage, per_page: MAX_PER_PAGE }, bypassCache);
      for (const scene of scenes) {
        if (!scene.tags.some((t) => excludeSet.has(t.id))) entry.scenes.push(scene);
      }
      if (scenes.length < MAX_PER_PAGE) {
        entry.exhausted = true;
      } else {
        entry.internalPage++;
      }
    }

    return {
      count: entry.exhausted ? entry.scenes.length : entry.scenes.length + 1,
      scenes: entry.scenes.slice(skip, skip + perPage),
      approximateCount: !entry.exhausted,
    };
  }

  // Picks a random ~2-month slice of StashDB's history and pages through it —
  // "Random" charts mode. StashDB's DateCriterionInput has no BETWEEN/value2
  // (confirmed by introspection), just a single value+modifier, so a genuine
  // date *range* means the same trick as queryScenesExcluding above: fetch
  // ascending from a random start (GREATER_THAN, cheap and indexed) and drop
  // anything past the window's end client-side, accumulating into a cache
  // keyed on the filter (not the page) so paging forward reuses what's
  // already been fetched. The window itself is part of that cache entry, so
  // it stays fixed while you page through it and only rerolls on a fresh
  // cache miss (TTL expiry or an explicit reset/refresh).
  //
  // Popularity-within-this-window was considered and dropped: StashDB
  // exposes no popularity field to sort client-side (confirmed by
  // introspection), and its own `sort: POPULARITY` can't be combined with a
  // date *range* (only a one-sided filter) — ranking by it here would mean
  // paging through popularity order with no chronological cutoff to stop at,
  // either capped-and-approximate or an unbounded scan. Staying with date
  // order, which is exact and cheap.
  private randomWindow(): { start: string; end: string } {
    const latestStart = Date.now() - RANDOM_WINDOW_DAYS * 24 * 60 * 60 * 1000;
    const span = Math.max(0, latestStart - RANDOM_WINDOW_RANGE_START);
    const startMs = RANDOM_WINDOW_RANGE_START + (span > 0 ? randomInt(0, span) : 0);
    const start = new Date(startMs).toISOString().slice(0, 10);
    const end = new Date(startMs + RANDOM_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    return { start, end };
  }

  async queryScenesRandomWindow(
    input: Partial<SceneQueryInput>,
    excludeTagIds: string[],
    opts: { reset?: boolean; bypassCache?: boolean } = {},
  ): Promise<{ count: number; scenes: Scene[]; approximateCount: boolean }> {
    const perPage = Math.min(input.per_page ?? 25, MAX_PER_PAGE);
    const page = input.page ?? 1;
    const skip = (page - 1) * perPage;

    // date/sort/direction are ours to set — a saved filter's own date
    // criterion (if any) would defeat the point of a random window.
    const { date: _date, sort: _sort, direction: _direction, page: _page, per_page: _perPage, ...baseInput } = input;
    const key = JSON.stringify({ ...baseInput, excludeTagIds: [...excludeTagIds].sort((a, b) => a.localeCompare(b)) });
    if (opts.reset || opts.bypassCache) randomWindowCache.delete(key);
    let entry = randomWindowCache.get(key);
    if (!entry || Date.now() - entry.at > RANDOM_WINDOW_TTL_MS) {
      const { start, end } = this.randomWindow();
      entry = { scenes: [], exhausted: false, internalPage: 1, at: Date.now(), start, end };
      randomWindowCache.set(key, entry);
      capMap(randomWindowCache, FILTER_CACHE_MAX_ENTRIES);
    }
    const excludeSet = new Set(excludeTagIds);

    for (let fetched = 0; entry.scenes.length < skip + perPage && !entry.exhausted && fetched < SCENE_SCAN_BUDGET; fetched++) {
      await this.advanceRandomWindowEntry(entry, baseInput, excludeSet, opts.bypassCache);
    }

    return {
      count: entry.exhausted ? entry.scenes.length : entry.scenes.length + 1,
      scenes: entry.scenes.slice(skip, skip + perPage),
      approximateCount: !entry.exhausted,
    };
  }

  private async advanceRandomWindowEntry(
    entry: RandomWindowEntry,
    baseInput: Partial<SceneQueryInput>,
    excludeSet: Set<string>,
    bypassCache?: boolean,
  ): Promise<void> {
    const { scenes } = await this.queryScenes(
      {
        ...baseInput,
        date: { value: entry.start, modifier: "GREATER_THAN" },
        sort: "DATE",
        direction: "ASC",
        page: entry.internalPage,
        per_page: MAX_PER_PAGE,
      },
      bypassCache,
    );
    let pastEnd = false;
    for (const scene of scenes) {
      if (scene.release_date && scene.release_date > entry.end) {
        pastEnd = true;
        break;
      }
      if (!scene.tags.some((t) => excludeSet.has(t.id))) entry.scenes.push(scene);
    }
    entry.exhausted = pastEnd || scenes.length < MAX_PER_PAGE;
    if (!entry.exhausted) entry.internalPage++;
  }

  // Merges several saved filters (the Subscribed feed) into one paginated, deduped
  // result — round-robinned across sources (see interleave() above) — cached per
  // filter-set so paging forward reuses each source's already-fetched pages
  // instead of re-querying every source again.
  async queryMergedFeed(
    sources: { input: Partial<SceneQueryInput>; excludeTagIds: string[]; label: string }[],
    page: number,
    perPage: number,
    cacheKey: string,
    ignoredIds: Set<string> = new Set(),
    opts: { randomize?: boolean; reset?: boolean; bypassCache?: boolean } = {},
  ): Promise<{ count: number; scenes: Scene[]; approximateCount: boolean }> {
    const skip = (page - 1) * perPage;
    // `reset` re-shuffles on every fresh visit to page 1 rather than only when
    // the cache naturally expires. It must come from the *client's* requested
    // page (the caller decides this once, up front) — queryMergedFeed's own
    // `page` here is fetchFilteredPage's internal round cursor, which always
    // restarts at 1 within a single request regardless of the page the client
    // actually asked for, so using it directly would reseed mid-pagination and
    // reshuffle/duplicate/skip scenes across what should be stable pages.
    if (opts.reset || opts.bypassCache) mergedFeedCache.delete(cacheKey);
    let entry = mergedFeedCache.get(cacheKey);
    if (!entry || Date.now() - entry.at > MERGED_FEED_TTL_MS) {
      entry = {
        merged: [],
        seen: new Set(),
        cursors: sources.map(() => ({ internalPage: 1, exhausted: false })),
        exhaustedAll: false,
        at: Date.now(),
      };
      mergedFeedCache.set(cacheKey, entry);
      capMap(mergedFeedCache, FILTER_CACHE_MAX_ENTRIES);
    }
    // Visible = the merged list minus whatever's been ignored since — filtered
    // here (not just skipped on insert) so a scene ignored after being cached
    // disappears immediately rather than waiting for the cache to expire.
    const visible = () => entry!.merged.filter((s) => !ignoredIds.has(s.id));

    let round = 0;
    while (visible().length < skip + perPage && !entry.exhaustedAll && round < MAX_MERGE_ROUNDS) {
      // Fan out to every source in parallel — the rate limiter (throttle())
      // still caps actual dispatch, this just stops each source's round-trip
      // latency from stacking. Each advance does its await then a synchronous
      // dedup-and-append, so concurrent sources can't interleave a duplicate.
      await Promise.all(
        sources.map((src, i) => this.advanceMergedFeedSource(entry!, src, entry!.cursors[i], opts)),
      );
      entry.exhaustedAll = entry.cursors.every((c) => c.exhausted);
      round++;
    }

    const visibleScenes = visible();
    return {
      count: visibleScenes.length,
      scenes: visibleScenes.slice(skip, skip + perPage),
      approximateCount: !entry.exhaustedAll,
    };
  }

  // Always fetches in fast, indexed DATE order — StashDB's random sort is a
  // slow full-table shuffle at this scale. For `randomize`, shuffles each
  // freshly-fetched batch before appending instead: already-appended scenes
  // keep their position (so pages already served stay stable), but new
  // arrivals land in a randomized spot rather than strict date order.
  private async advanceMergedFeedSource(
    entry: MergedFeedEntry,
    src: { input: Partial<SceneQueryInput>; excludeTagIds: string[]; label: string },
    cursor: { internalPage: number; exhausted: boolean },
    opts: { randomize?: boolean; bypassCache?: boolean },
  ): Promise<void> {
    if (cursor.exhausted) return;
    const { scenes } = await this.queryScenes({ ...src.input, page: cursor.internalPage, per_page: MAX_PER_PAGE }, opts.bypassCache);
    const excludeSet = new Set(src.excludeTagIds);
    const fresh: Scene[] = [];
    for (const scene of scenes) {
      if (entry.seen.has(scene.id) || scene.tags.some((t) => excludeSet.has(t.id))) continue;
      entry.seen.add(scene.id);
      scene.sourceLabel = src.label;
      fresh.push(scene);
    }
    if (opts.randomize) shuffle(fresh);
    entry.merged.push(...fresh);
    if (scenes.length < MAX_PER_PAGE) cursor.exhausted = true;
    else cursor.internalPage++;
  }

  private async search(queryName: string, text: string): Promise<{ id: string; name: string }[]> {
    const data = await gql<Record<string, { id: string; name: string }[]>>(
      this.cfg.stashdbUrl,
      this.cfg.stashdbApiKey,
      `query ($term: String!, $limit: Int) {
        ${queryName}(term: $term, limit: $limit) { id name }
      }`,
      { term: text, limit: 10 },
      false,
      5 * 60_000,
    );
    return data[queryName];
  }

  // Resolves ids back to names (e.g. re-populating a saved filter's chips) in one
  // request via aliases, rather than one lookup call per id. Capped — the id
  // list comes straight from a query string, and one aliased field per id
  // would otherwise let an arbitrarily long list balloon the GraphQL query.
  private async findByIds(queryName: string, ids: string[]): Promise<{ id: string; name: string }[]> {
    if (ids.length === 0) return [];
    const capped = ids.slice(0, MAX_LOOKUP_IDS);
    const variables: Record<string, string> = {};
    const fields = capped
      .map((id, i) => {
        variables[`id${i}`] = id;
        return `t${i}: ${queryName}(id: $id${i}) { id name }`;
      })
      .join("\n");
    const argsDecl = capped.map((_, i) => `$id${i}: ID!`).join(", ");
    const data = await gql<Record<string, { id: string; name: string } | null>>(
      this.cfg.stashdbUrl,
      this.cfg.stashdbApiKey,
      `query (${argsDecl}) { ${fields} }`,
      variables,
      false,
      30 * 60_000, // id -> name; effectively immutable
    );
    return Object.values(data).filter((t): t is { id: string; name: string } => t !== null);
  }

  findTags(text: string): Promise<{ id: string; name: string }[]> {
    return this.search("searchTag", text);
  }
  findTagsByIds(ids: string[]): Promise<{ id: string; name: string }[]> {
    return this.findByIds("findTag", ids);
  }
  findPerformers(text: string): Promise<{ id: string; name: string }[]> {
    return this.search("searchPerformer", text);
  }
  findPerformersByIds(ids: string[]): Promise<{ id: string; name: string }[]> {
    return this.findByIds("findPerformer", ids);
  }
  findStudios(text: string): Promise<{ id: string; name: string }[]> {
    return this.search("searchStudio", text);
  }
  findStudiosByIds(ids: string[]): Promise<{ id: string; name: string }[]> {
    return this.findByIds("findStudio", ids);
  }

  // Full record for the Performers/Studios tab header — 30-min TTL, same as the
  // id->name lookups (this data changes rarely).
  async findPerformerDetails(id: string): Promise<PerformerDetails | null> {
    const data = await gql<{ findPerformer: PerformerDetails | null }>(
      this.cfg.stashdbUrl,
      this.cfg.stashdbApiKey,
      `query ($id: ID!) {
        findPerformer(id: $id) {
          id name disambiguation gender birth_date age country ethnicity
          eye_color hair_color height cup_size band_size waist_size hip_size
          breast_type career_start_year career_end_year aliases scene_count
          images { url width height }
          urls { url site { name } }
        }
      }`,
      { id },
      false,
      30 * 60_000,
    );
    return data.findPerformer;
  }

  async findStudioDetails(id: string): Promise<StudioDetails | null> {
    const data = await gql<{ findStudio: StudioDetails | null }>(
      this.cfg.stashdbUrl,
      this.cfg.stashdbApiKey,
      `query ($id: ID!) {
        findStudio(id: $id) {
          id name aliases
          parent { id name }
          images { url width height }
          urls { url site { name } }
        }
      }`,
      { id },
      false,
      30 * 60_000,
    );
    return data.findStudio;
  }
}
