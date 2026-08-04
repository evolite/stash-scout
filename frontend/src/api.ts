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

export interface SceneFilter {
  text?: string;
  tags?: string; // comma-separated ids
  tags_modifier?: "INCLUDES" | "INCLUDES_ALL" | "EXCLUDES";
  exclude_tags?: string; // comma-separated ids, applied server-side alongside `tags`
  performers?: string;
  studios?: string;
  date?: string;
  date_modifier?: "EQUALS" | "GREATER_THAN" | "LESS_THAN";
  sort?: string;
  direction?: "ASC" | "DESC";
  page?: number;
  per_page?: number;
}

export type SceneStatus =
  | { kind: "not-configured" }
  | { kind: "in-stash"; localSceneId: string; localUrl: string }
  | { kind: "not-added"; whisparrConfigured: boolean }
  | { kind: "previously-added"; movieId: number }
  | { kind: "monitored"; movieId: number }
  | { kind: "downloading"; movieId: number; queue: { size?: number; sizeleft?: number; status?: string } };

export interface SavedFilter {
  id: string;
  name: string;
  createdAt: string;
  filter: SceneFilter;
  watched: boolean;
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init);
  if (!res.ok) throw new Error(`${path} failed: HTTP ${res.status}`);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

function qs(filter: SceneFilter): string {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(filter)) {
    if (v !== undefined && v !== "") params.set(k, String(v));
  }
  return params.toString();
}

export const api = {
  queryScenes: (filter: SceneFilter) =>
    req<{ count: number; scenes: Scene[]; approximateCount?: boolean }>(`/api/scenes?${qs(filter)}`),
  watchedFeed: (page: number, perPage: number) =>
    req<{ count: number; scenes: Scene[]; approximateCount?: boolean }>(`/api/watched-feed?page=${page}&per_page=${perPage}`),
  searchTags: (term: string) => req<{ id: string; name: string }[]>(`/api/tags/search?term=${encodeURIComponent(term)}`),
  tagsByIds: (ids: string[]) => (ids.length ? req<{ id: string; name: string }[]>(`/api/tags/byIds?ids=${ids.join(",")}`) : Promise.resolve([])),
  sceneStatuses: (ids: string[]) =>
    req<Record<string, SceneStatus>>(`/api/scenes/status?ids=${ids.join(",")}`),
  addToWhisparr: (stashId: string) => req(`/api/whisparr/scenes/${stashId}`, { method: "POST" }),
  setMonitored: (movieId: number, monitored: boolean) =>
    req(`/api/whisparr/scenes/${movieId}/monitor`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ monitored }),
    }),
  listFilters: () => req<SavedFilter[]>(`/api/filters`),
  saveFilter: (name: string, filter: SceneFilter) =>
    req<SavedFilter>(`/api/filters`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, filter }),
    }),
  deleteFilter: (id: string) => req(`/api/filters/${id}`, { method: "DELETE" }),
  setFilterWatched: (id: string, watched: boolean) =>
    req<SavedFilter>(`/api/filters/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ watched }),
    }),
  overwriteFilter: (id: string, filter: SceneFilter) =>
    req<SavedFilter>(`/api/filters/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filter }),
    }),
  ignoreScene: (id: string) =>
    req(`/api/ignored-scenes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    }),
  settings: () =>
    req<{ stashdbConfigured: boolean; localStashConfigured: boolean; whisparrConfigured: boolean; whisparrFullyConfigured: boolean }>(
      `/api/settings`,
    ),
  testSettings: () => req<{ stashdb: boolean; localStash: boolean; whisparr: boolean }>(`/api/settings/test`),
};
