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

// Ported from StashSeer's getLocalStashSceneIdByStashId: try URL match first,
// then fall back to the stash_id_endpoint filter (StashSeer, stashseer.js ~1710-1786).
export class LocalStashClient {
  constructor(private cfg: AppConfig) {}

  async findSceneIdByStashId(stashId: string): Promise<string | null> {
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
