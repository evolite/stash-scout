import type { AppConfig } from "./config.js";

// StashDB's schema only has one `tags` filter (no separate exclude_tags field) — an
// EXCLUDES modifier query and an INCLUDES/INCLUDES_ALL query are mutually exclusive,
// so "include these AND exclude those" needs two requests intersected client-side.
// v1 exposes a single tags criterion (one modifier at a time) to match what the API
// actually supports in one call; combined include+exclude is a documented v2 gap.
export interface SceneQueryInput {
  text?: string;
  tags?: { value: string[]; modifier: "INCLUDES" | "INCLUDES_ALL" | "EXCLUDES" };
  performers?: { value: string[]; modifier: "INCLUDES" | "INCLUDES_ALL" | "EXCLUDES" };
  studios?: { value: string[]; modifier: "INCLUDES" | "INCLUDES_ALL" | "EXCLUDES" };
  date?: { value: string; modifier: "EQUALS" | "GREATER_THAN" | "LESS_THAN" };
  page: number;
  per_page: number;
  sort: string;
  direction: string;
}

export interface Scene {
  id: string;
  title: string | null;
  release_date: string | null;
  duration: number | null;
  studio: { id: string; name: string } | null;
  tags: { id: string; name: string }[];
  images: { id: string; url: string; width: number; height: number }[];
  performers: { performer: { id: string; name: string }; as: string | null }[];
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
const responseCache = new Map<string, { at: number; data: unknown }>();

async function gql<T>(url: string, apiKey: string | undefined, query: string, variables: unknown): Promise<T> {
  if (!apiKey) {
    throw new Error("StashDB is not configured — add an API key in Settings.");
  }
  const cacheKey = query + JSON.stringify(variables);
  const cached = responseCache.get(cacheKey);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
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
const excludeCache = new Map<string, ExcludeCacheEntry>();

// Merged "watched filters" feed — same idea as excludeCache but fanning out to
// several source filters, deduping by scene id, and keeping each source's own
// page cursor so growing the feed doesn't restart every source from page 1.
//
// Results are kept per-source (each individually date-desc, as StashDB returns
// them) rather than combined into one globally date-sorted list, and the output
// round-robins one scene from each source in turn. A pure global date sort would
// let one prolific filter's results fill the entire visible page before a rarer
// filter's results ever surfaced — round-robin guarantees every watched filter
// gets representation instead of the most active one crowding out the rest.
const MERGED_FEED_TTL_MS = 5 * 60_000;
const MAX_MERGE_ROUNDS = 3;
interface MergedFeedEntry {
  perSource: Scene[][];
  seen: Set<string>;
  cursors: { internalPage: number; exhausted: boolean }[];
  exhaustedAll: boolean;
  at: number;
}
const mergedFeedCache = new Map<string, MergedFeedEntry>();

function interleave(perSource: Scene[][], ignoredIds: Set<string>): Scene[] {
  const lists = perSource.map((list) => list.filter((s) => !ignoredIds.has(s.id)));
  const idx = lists.map(() => 0);
  const result: Scene[] = [];
  let added = true;
  while (added) {
    added = false;
    for (let i = 0; i < lists.length; i++) {
      if (idx[i] < lists[i].length) {
        result.push(lists[i][idx[i]]);
        idx[i]++;
        added = true;
      }
    }
  }
  return result;
}

export class StashDBClient {
  constructor(private cfg: AppConfig) {}

  async queryScenes(input: Partial<SceneQueryInput>): Promise<{ count: number; scenes: Scene[] }> {
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
  ): Promise<{ count: number; scenes: Scene[]; approximateCount: boolean }> {
    const perPage = Math.min(input.per_page ?? 25, MAX_PER_PAGE);
    const page = input.page ?? 1;
    const skip = (page - 1) * perPage;

    const key = JSON.stringify({ ...input, page: undefined, per_page: undefined, excludeTagIds: [...excludeTagIds].sort() });
    let entry = excludeCache.get(key);
    if (!entry || Date.now() - entry.at > EXCLUDE_CACHE_TTL_MS) {
      entry = { scenes: [], totalCount: 0, exhausted: false, internalPage: 1, at: Date.now() };
      excludeCache.set(key, entry);
    }
    const excludeSet = new Set(excludeTagIds);

    while (entry.scenes.length < skip + perPage && !entry.exhausted && entry.scenes.length < MAX_CACHED_SCENES) {
      const { count, scenes } = await this.queryScenes({ ...input, page: entry.internalPage, per_page: MAX_PER_PAGE });
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

  // Merges several saved filters (the Watched feed) into one paginated, deduped
  // result — round-robinned across sources (see interleave() above) — cached per
  // filter-set so paging forward reuses each source's already-fetched pages
  // instead of re-querying every source again.
  async queryMergedFeed(
    sources: { input: Partial<SceneQueryInput>; excludeTagIds: string[] }[],
    page: number,
    perPage: number,
    cacheKey: string,
    ignoredIds: Set<string> = new Set(),
  ): Promise<{ count: number; scenes: Scene[]; approximateCount: boolean }> {
    const skip = (page - 1) * perPage;
    let entry = mergedFeedCache.get(cacheKey);
    if (!entry || Date.now() - entry.at > MERGED_FEED_TTL_MS) {
      entry = {
        perSource: sources.map(() => []),
        seen: new Set(),
        cursors: sources.map(() => ({ internalPage: 1, exhausted: false })),
        exhaustedAll: false,
        at: Date.now(),
      };
      mergedFeedCache.set(cacheKey, entry);
    }
    // Visible = interleaved minus whatever's been ignored since — filtered here
    // (not just skipped on insert) so a scene ignored after being cached
    // disappears immediately rather than waiting for the cache to expire.
    const visible = () => interleave(entry!.perSource, ignoredIds);
    const totalFetched = () => entry!.perSource.reduce((n, list) => n + list.length, 0);

    let round = 0;
    while (visible().length < skip + perPage && !entry.exhaustedAll && totalFetched() < MAX_CACHED_SCENES && round < MAX_MERGE_ROUNDS) {
      for (let i = 0; i < sources.length; i++) {
        const cursor = entry.cursors[i];
        if (cursor.exhausted) continue;
        const src = sources[i];
        const { scenes } = await this.queryScenes({ ...src.input, page: cursor.internalPage, per_page: MAX_PER_PAGE });
        const excludeSet = new Set(src.excludeTagIds);
        for (const scene of scenes) {
          if (entry.seen.has(scene.id) || scene.tags.some((t) => excludeSet.has(t.id))) continue;
          entry.seen.add(scene.id);
          entry.perSource[i].push(scene);
        }
        if (scenes.length < MAX_PER_PAGE) cursor.exhausted = true;
        else cursor.internalPage++;
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

  async findTags(text: string): Promise<{ id: string; name: string }[]> {
    const data = await gql<{ searchTag: { id: string; name: string }[] }>(
      this.cfg.stashdbUrl,
      this.cfg.stashdbApiKey,
      `query ($term: String!, $limit: Int) {
        searchTag(term: $term, limit: $limit) { id name }
      }`,
      { term: text, limit: 10 },
    );
    return data.searchTag;
  }

  // Resolves tag IDs back to names (e.g. re-populating a saved filter's chips) in
  // one request via aliases, rather than one findTag call per id.
  async findTagsByIds(ids: string[]): Promise<{ id: string; name: string }[]> {
    if (ids.length === 0) return [];
    const variables: Record<string, string> = {};
    const fields = ids
      .map((id, i) => {
        variables[`id${i}`] = id;
        return `t${i}: findTag(id: $id${i}) { id name }`;
      })
      .join("\n");
    const argsDecl = ids.map((_, i) => `$id${i}: ID!`).join(", ");
    const data = await gql<Record<string, { id: string; name: string } | null>>(
      this.cfg.stashdbUrl,
      this.cfg.stashdbApiKey,
      `query (${argsDecl}) { ${fields} }`,
      variables,
    );
    return Object.values(data).filter((t): t is { id: string; name: string } => t !== null);
  }
}
