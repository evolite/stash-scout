import type { AppConfig } from "./config.js";
import { capMap } from "./cacheUtil.js";

// A hung/unresponsive local Stash otherwise leaves fetch() pending
// indefinitely — Node's fetch has no default timeout.
const FETCH_TIMEOUT_MS = 15_000;

async function gql<T>(url: string, apiKey: string, query: string, variables: unknown, cfg: AppConfig): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json", ApiKey: apiKey };
  if (cfg.cfAccessClientId && cfg.cfAccessClientSecret) {
    headers["CF-Access-Client-Id"] = cfg.cfAccessClientId;
    headers["CF-Access-Client-Secret"] = cfg.cfAccessClientSecret;
  }
  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) {
    throw new Error(`Local Stash request failed: HTTP ${res.status}`);
  }
  const json = (await res.json()) as { data?: T; errors?: { message: string }[] };
  if (json.errors?.length) {
    throw new Error(`Local Stash GraphQL error: ${json.errors.map((e) => e.message).join("; ")}`);
  }
  return json.data as T;
}

// Every grid render fans out one of these per visible scene (up to 40 a page,
// on every filter/sort/pagination change and every card status refresh) — and
// most of those scenes aren't in the library yet, which is the case that
// costs *two* sequential round trips below. Unlike the StashDB/Whisparr
// clients, this had no cache at all, so the same scene got re-checked from
// scratch on every render. A short TTL plus in-flight de-dupe (mirroring
// WhisparrClient's movie-list cache) cuts that back to one round trip per
// scene per window, which is most of what made browsing feel slow.
// 5 minutes, not 30s: unlike Whisparr's monitored/queue state (which this app
// mutates directly and invalidates on Add/Monitor), local Stash's contents
// only change via a library scan on the Stash server itself — an external,
// infrequent event this app has no hook into either way, so a longer TTL
// costs nothing in the common case. Matches stashdbClient's own 5-minute
// caches (EXCLUDE_CACHE_TTL_MS / MERGED_FEED_TTL_MS) for consistency.
const SCENE_ID_CACHE_TTL_MS = 5 * 60_000;
const SCENE_ID_CACHE_MAX_ENTRIES = 2000;
const NOT_FOUND_TTL_MS = 30_000;
const BATCH_MAX = 50;
const sceneIdCache = new Map<string, { at: number; promise: Promise<string | null> }>();

// Ported from StashSeer's getLocalStashSceneIdByStashId: try URL match first,
// then fall back to the stash_id_endpoint filter (StashSeer, stashseer.js ~1710-1786).
export class LocalStashClient {
  constructor(private readonly cfg: AppConfig) {}

  findSceneIdByStashId(stashId: string): Promise<string | null> {
    const cached = sceneIdCache.get(stashId);
    if (cached && Date.now() - cached.at < SCENE_ID_CACHE_TTL_MS) {
      return cached.promise;
    }
    const promise = this.lookupSceneIdByStashId(stashId).catch((err) => {
      sceneIdCache.delete(stashId);
      throw err;
    });
    const entry = { at: Date.now(), promise };
    sceneIdCache.set(stashId, entry);
    // A scene just scanned into Stash shouldn't read "not added" for the full TTL.
    void promise.then((id) => {
      if (id === null) entry.at -= SCENE_ID_CACHE_TTL_MS - NOT_FOUND_TTL_MS;
    });
    capMap(sceneIdCache, SCENE_ID_CACHE_MAX_ENTRIES);
    return promise;
  }

  // Lookups issued in the same tick (a grid page's Promise.all) are flushed as
  // one request with aliased findScenes, instead of 1-2 round trips per scene.
  private readonly pending: { stashId: string; resolve: (id: string | null) => void }[] = [];

  private lookupSceneIdByStashId(stashId: string): Promise<string | null> {
    return new Promise((resolve) => {
      if (this.pending.push({ stashId, resolve }) === 1) queueMicrotask(() => this.flush());
    });
  }

  private flush() {
    const batch = this.pending.splice(0);
    for (let i = 0; i < batch.length; i += BATCH_MAX) void this.lookupBatch(batch.slice(i, i + BATCH_MAX));
  }

  // URL match first, then stash_id_endpoint (see StashSeer note above) — both
  // aliased per scene; the URL hit wins when both match.
  private async lookupBatch(batch: { stashId: string; resolve: (id: string | null) => void }[]) {
    const defs: string[] = [];
    const fields: string[] = [];
    const variables: Record<string, unknown> = {};
    batch.forEach(({ stashId }, i) => {
      defs.push(`$u${i}: SceneFilterType, $s${i}: SceneFilterType`);
      fields.push(`u${i}: findScenes(scene_filter: $u${i}) { scenes { id } } s${i}: findScenes(scene_filter: $s${i}) { scenes { id } }`);
      variables[`u${i}`] = { url: { modifier: "EQUALS", value: `https://stashdb.org/scenes/${stashId}` } };
      variables[`s${i}`] = { stash_id_endpoint: { endpoint: "", modifier: "EQUALS", stash_id: stashId } };
    });
    let data: Record<string, { scenes: { id: string }[] }> | undefined;
    try {
      data = await gql(this.cfg.localStashUrl!, this.cfg.localStashApiKey!, `query (${defs.join(", ")}) { ${fields.join(" ")} }`, variables, this.cfg);
    } catch {
      // unreachable/erroring Stash: treat as not found, as the per-scene lookup did
    }
    batch.forEach(({ resolve }, i) => resolve(data?.[`u${i}`]?.scenes[0]?.id ?? data?.[`s${i}`]?.scenes[0]?.id ?? null));
  }

  async testConnection(): Promise<boolean> {
    try {
      await gql<{ __typename: string }>(this.cfg.localStashUrl!, this.cfg.localStashApiKey!, `query { __typename }`, {}, this.cfg);
      return true;
    } catch {
      return false;
    }
  }
}
