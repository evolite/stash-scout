import type { Scene, SceneStatus, GlobalExcludeTag, StatsSummary, SavedFilter as BaseSavedFilter } from "../../shared/types.js";
export type { Scene, SceneStatus, GlobalExcludeTag, StatsSummary };

export interface SceneFilter {
  text?: string;
  tags?: string; // comma-separated ids
  tags_modifier?: "INCLUDES" | "INCLUDES_ALL" | "EXCLUDES";
  exclude_tags?: string; // comma-separated ids, applied server-side alongside `tags`
  performers?: string;
  studios?: string;
  date?: string;
  date_modifier?: "EQUALS" | "GREATER_THAN" | "LESS_THAN";
  favorites?: "PERFORMER" | "STUDIO" | "ALL";
  unadded?: "1";
  max_duration?: number;
  sort?: string;
  direction?: "ASC" | "DESC";
  page?: number;
  per_page?: number;
}

export type SavedFilter = BaseSavedFilter<SceneFilter>;

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
  queryScenes: (filter: SceneFilter, refresh = false) =>
    req<{ count: number; scenes: Scene[]; approximateCount?: boolean }>(`/api/scenes?${qs(filter)}${refresh ? "&refresh=1" : ""}`),
  watchedFeed: (page: number, perPage: number, window: "week" | "month" | "year", source?: string, showInLibrary = false, refresh = false) =>
    req<{ count: number; scenes: Scene[]; approximateCount?: boolean }>(
      `/api/watched-feed?page=${page}&per_page=${perPage}&window=${window}${source ? `&source=${encodeURIComponent(source)}` : ""}${showInLibrary ? "&unadded=0" : ""}${refresh ? "&refresh=1" : ""}`,
    ),
  searchTags: (term: string) => req<{ id: string; name: string }[]>(`/api/tags/search?term=${encodeURIComponent(term)}`),
  tagsByIds: (ids: string[]) => (ids.length ? req<{ id: string; name: string }[]>(`/api/tags/byIds?ids=${ids.join(",")}`) : Promise.resolve([])),
  searchPerformers: (term: string) => req<{ id: string; name: string }[]>(`/api/performers/search?term=${encodeURIComponent(term)}`),
  performersByIds: (ids: string[]) =>
    ids.length ? req<{ id: string; name: string }[]>(`/api/performers/byIds?ids=${ids.join(",")}`) : Promise.resolve([]),
  searchStudios: (term: string) => req<{ id: string; name: string }[]>(`/api/studios/search?term=${encodeURIComponent(term)}`),
  studiosByIds: (ids: string[]) =>
    ids.length ? req<{ id: string; name: string }[]>(`/api/studios/byIds?ids=${ids.join(",")}`) : Promise.resolve([]),
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
  renameFilter: (id: string, name: string) =>
    req<SavedFilter>(`/api/filters/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
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
  getConfig: () =>
    req<{
      stashdbUrl: string;
      stashdbApiKeySet: boolean;
      localStashUrl: string;
      localStashApiKeySet: boolean;
      localStashRootUrl: string;
      whisparrBaseUrl: string;
      whisparrApiKeySet: boolean;
      whisparrRootFolderPath: string;
      whisparrQualityProfileId: number | null;
      cfAccessClientId: string;
      cfAccessClientSecretSet: boolean;
    }>(`/api/settings/config`),
  updateConfig: (patch: Record<string, string | number | null>) =>
    req(`/api/settings/config`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    }),
  whisparrOptions: () =>
    req<{ rootFolders: { id: number; path: string }[]; qualityProfiles: { id: number; name: string }[] }>(`/api/whisparr/options`),
  stats: () => req<StatsSummary>(`/api/stats`),
  listGlobalExcludeTags: () => req<GlobalExcludeTag[]>(`/api/global-exclude-tags`),
  addGlobalExcludeTag: (id: string, name: string) =>
    req<GlobalExcludeTag[]>(`/api/global-exclude-tags`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, name }),
    }),
  removeGlobalExcludeTag: (id: string) => req(`/api/global-exclude-tags/${id}`, { method: "DELETE" }),
};
