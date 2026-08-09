import type { AppConfig } from "./config.js";

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
const sceneIdCache = new Map<string, { at: number; promise: Promise<string | null> }>();

// Ported from StashSeer's getLocalStashSceneIdByStashId: try URL match first,
// then fall back to the stash_id_endpoint filter (StashSeer, stashseer.js ~1710-1786).
export class LocalStashClient {
  constructor(private cfg: AppConfig) {}

  findSceneIdByStashId(stashId: string): Promise<string | null> {
    const cached = sceneIdCache.get(stashId);
    if (cached && Date.now() - cached.at < SCENE_ID_CACHE_TTL_MS) {
      return cached.promise;
    }
    const promise = this.lookupSceneIdByStashId(stashId).catch((err) => {
      sceneIdCache.delete(stashId);
      throw err;
    });
    sceneIdCache.set(stashId, { at: Date.now(), promise });
    return promise;
  }

  private async lookupSceneIdByStashId(stashId: string): Promise<string | null> {
    const url = this.cfg.localStashUrl!;
    const apiKey = this.cfg.localStashApiKey!;

    try {
      const byUrl = await gql<{ findScenes: { scenes: { id: string }[] } }>(
        url,
        apiKey,
        `query ($scene_filter: SceneFilterType) {
          findScenes(scene_filter: $scene_filter) { scenes { id } }
        }`,
        {
          scene_filter: {
            url: { modifier: "EQUALS", value: `https://stashdb.org/scenes/${stashId}` },
          },
        },
        this.cfg,
      );
      const found = byUrl.findScenes.scenes[0]?.id;
      if (found) return found;
    } catch {
      // fall through to stash_id_endpoint lookup
    }

    try {
      const byStashId = await gql<{ findScenes: { scenes: { id: string }[] } }>(
        url,
        apiKey,
        `query ($scene_filter: SceneFilterType) {
          findScenes(scene_filter: $scene_filter) { scenes { id } }
        }`,
        {
          scene_filter: {
            stash_id_endpoint: { endpoint: "", modifier: "EQUALS", stash_id: stashId },
          },
        },
        this.cfg,
      );
      return byStashId.findScenes.scenes[0]?.id ?? null;
    } catch {
      return null;
    }
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
