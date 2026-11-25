import { extraHeaders, type AppConfig } from "./config.js";
import { capMap } from "./cacheUtil.js";

const FETCH_TIMEOUT_MS = 15_000;

async function gql<T>(url: string, apiKey: string, query: string, variables: unknown, cfg: AppConfig): Promise<T> {
  const headers: Record<string, string> = { ...extraHeaders(cfg), "Content-Type": "application/json", ApiKey: apiKey };
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

const SCENE_ID_CACHE_TTL_MS = 5 * 60_000;
const SCENE_ID_CACHE_MAX_ENTRIES = 2000;
const NOT_FOUND_TTL_MS = 30_000;
const BATCH_MAX = 50;
const sceneIdCache = new Map<string, { at: number; promise: Promise<string | null> }>();

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
    void promise.then((id) => {
      if (id === null) entry.at -= SCENE_ID_CACHE_TTL_MS - NOT_FOUND_TTL_MS;
    });
    capMap(sceneIdCache, SCENE_ID_CACHE_MAX_ENTRIES);
    return promise;
  }

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
      /* ignore */
    }
    batch.forEach(({ resolve }, i) => resolve(data?.[`u${i}`]?.scenes[0]?.id ?? data?.[`s${i}`]?.scenes[0]?.id ?? null));
  }

  async systemStatus(): Promise<string> {
    const data = await gql<{ systemStatus: { status: string } }>(
      this.cfg.localStashUrl!,
      this.cfg.localStashApiKey!,
      `query { systemStatus { status } }`,
      {},
      this.cfg,
    );
    return data.systemStatus.status;
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
