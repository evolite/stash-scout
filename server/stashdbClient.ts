import { randomInt } from "node:crypto";
import type { AppConfig } from "./config.js";
import type { Scene } from "../shared/types.js";
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

const SCENE_FIELDS = `
  id
  title
  release_date
  duration
  studio { id name }
  tags { id name }
  images { id url width height }
  performers { performer { id name } as }
`;

const MAX_PER_PAGE = 40;
const MAX_LOOKUP_IDS = 100;

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
const responseCache = new Map<string, { at: number; data: unknown }>();

async function gql<T>(url: string, apiKey: string | undefined, query: string, variables: unknown, bypassCache = false): Promise<T> {
  if (!apiKey) {
    throw new Error("StashDB is not configured — add an API key in Settings.");
  }
  const cacheKey = query + JSON.stringify(variables);
  const cached = responseCache.get(cacheKey);
  if (!bypassCache && cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return cached.data as T;
  }

  await throttle();
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ApiKey: apiKey },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) {
    throw new Error(`StashDB request failed: HTTP ${res.status}`);
  }
  const json = (await res.json()) as { data?: T; errors?: { message: string }[] };
  if (json.errors?.length) {
    throw new Error(`StashDB GraphQL error: ${json.errors.map((e) => e.message).join("; ")}`);
  }
  responseCache.set(cacheKey, { at: Date.now(), data: json.data });
  capMap(responseCache, RESPONSE_CACHE_MAX_ENTRIES);
  return json.data as T;
}

// Per-filter accumulated results for exclude-tag queries — keyed on the filter
// (minus page), so "next page" reuses previously-fetched StashDB pages instead
// of rescanning. Capped in size and lifetime to bound memory and staleness.
const EXCLUDE_CACHE_TTL_MS = 5 * 60_000;
const MAX_CACHED_SCENES = Number(process.env.STASHDB_MAX_CACHED_SCENES ?? 200);
interface ExcludeCacheEntry {
  scenes: Scene[];
  totalCount: number;
  exhausted: boolean;
  internalPage: number;
  at: number;
}
const FILTER_CACHE_MAX_ENTRIES = 200;
const excludeCache = new Map<string, ExcludeCacheEntry>();

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

// Merged "watched filters" feed — same idea as excludeCache but fanning out to
// several source filters, deduping by scene id, and keeping each source's own
// page cursor so growing the feed doesn't restart every source from page 1.
//
// The output round-robins one scene from each source per fetch round, appended
// directly to a single flat `merged` list as they're found (rather than kept
// per-source and re-interleaved by array position on every read). A pure global
// date sort would let one prolific filter's results fill the entire visible page
// before a rarer filter's results ever surfaced — round-robin guarantees every
// watched filter gets representation. Appending directly (instead of recomputing
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
    );
    return data.queryScenes;
  }

  // StashDB has no "include tag A, exclude tag B" query — its `tags` filter takes
  // one modifier. We fake it server-side: page through StashDB's results (which
  // already include each scene's full tag list), drop scenes carrying an excluded
  // tag, and keep the accumulated result *cached per filter* (not per page) so
  // paging forward through the browser reuses what's already been fetched instead
  // of re-scanning from page 1 every time. Capped at MAX_CACHED_SCENES total —
  // we're rate-limited by StashDB, so a heavily-excluded or very deep query comes
  // back short/approximate rather than fetching indefinitely to force a full page.
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
      entry = { scenes: [], totalCount: 0, exhausted: false, internalPage: 1, at: Date.now() };
      excludeCache.set(key, entry);
      capMap(excludeCache, FILTER_CACHE_MAX_ENTRIES);
    }
    const excludeSet = new Set(excludeTagIds);

    while (entry.scenes.length < skip + perPage && !entry.exhausted && entry.scenes.length < MAX_CACHED_SCENES) {
      const { count, scenes } = await this.queryScenes({ ...input, page: entry.internalPage, per_page: MAX_PER_PAGE }, bypassCache);
      entry.totalCount = count;
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
      count: entry.exhausted ? entry.scenes.length : entry.totalCount,
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

    while (entry.scenes.length < skip + perPage && !entry.exhausted && entry.scenes.length < MAX_CACHED_SCENES) {
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

  // Merges several saved filters (the Watched feed) into one paginated, deduped
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
    while (visible().length < skip + perPage && !entry.exhaustedAll && entry.merged.length < MAX_CACHED_SCENES && round < MAX_MERGE_ROUNDS) {
      for (let i = 0; i < sources.length; i++) {
        await this.advanceMergedFeedSource(entry, sources[i], entry.cursors[i], opts);
      }
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
}
