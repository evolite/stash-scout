import type { Scene, SceneStatus, GlobalExcludeTag, StatsSummary, PerformerDetails, PerformerResult, StudioDetails, SavedFilter as BaseSavedFilter, SavedPerformerSearch } from "../../shared/types.js";
import { hideParam } from "./genderPrefs.js";
export type { Scene, SceneStatus, GlobalExcludeTag, StatsSummary, PerformerDetails, PerformerResult, StudioDetails, SavedPerformerSearch };

export type PerformerSearchSummary = Omit<SavedPerformerSearch, "results"> & { resultCount: number };
export type PerformerQueryResult = { count: number; performers: PerformerResult[]; approximateCount?: boolean };

type NumMod = "GREATER_THAN" | "LESS_THAN" | "EQUALS";

// Flat wire shape for the "Discover performers" filter — same string-serialized
// style as SceneFilter. gender/ethnicity/country/age/birth_year/is_favorite are
// filtered by StashDB; eye_color/hair_color/height/cup_size/tattoos/piercings
// are filtered server-side by paging StashDB's results (it ignores those).
export interface PerformerFilter {
  name?: string;
  gender?: string;
  ethnicity?: string;
  country?: string;
  birth_year?: number;
  birth_year_modifier?: "GREATER_THAN" | "LESS_THAN"; // after / before
  is_favorite?: "1";
  eye_color?: string;
  hair_color?: string;
  height?: number;
  height_modifier?: NumMod;
  cup_size?: string;
  cup_size_modifier?: NumMod; // GREATER_THAN = larger/equal, LESS_THAN = smaller/equal
  tattoos?: "yes" | "no";
  piercings?: "yes" | "no";
  sort?: string;
  direction?: "ASC" | "DESC";
  page?: number;
  per_page?: number;
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
  favorites?: "PERFORMER" | "STUDIO" | "ALL";
  unadded?: "1";
  max_duration?: number;
  sort?: string;
  direction?: "ASC" | "DESC";
  page?: number;
  per_page?: number;
}

export type SavedFilter = BaseSavedFilter<SceneFilter>;

let sessionActive = false;
export function setSessionActive(on: boolean): void {
  sessionActive = on;
}

async function req<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(path, init);
  // Session expired mid-use: reload so main.ts shows the login view. Only once
  // main.ts has confirmed we were logged in — module-level fetches (Navbar's
  // config load) fire at import time, before login, and would reload forever.
  if (res.status === 401 && sessionActive && !path.startsWith("/api/auth/")) location.reload();
  if (!res.ok) {
    const detail = (await res.json().catch(() => null))?.error;
    throw new Error(detail ?? `${path} failed: HTTP ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

function qsValue(v: unknown): string {
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return JSON.stringify(v);
}

function qs(filter: object): string {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(filter)) {
    if (v === undefined || v === null || v === "") continue;
    params.set(k, qsValue(v));
  }
  return params.toString();
}

export const api = {
  queryScenes: (filter: SceneFilter, refresh = false) =>
    req<{ count: number; scenes: Scene[]; approximateCount?: boolean }>(`/api/scenes?${qs(filter)}${hideParam()}${refresh ? "&refresh=1" : ""}`),
  // Same filter shape as queryScenes — sort/date are ignored server-side, it
  // always picks its own random ~2-month window.
  randomScenes: (filter: SceneFilter, refresh = false) =>
    req<{ count: number; scenes: Scene[]; approximateCount?: boolean }>(`/api/scenes/random?${qs(filter)}${hideParam()}${refresh ? "&refresh=1" : ""}`),
  subscribedFeed: (page: number, perPage: number, window: "week" | "month" | "year", source?: string, showInLibrary = false, refresh = false) => {
    const sourceParam = source ? `&source=${encodeURIComponent(source)}` : "";
    return req<{ count: number; scenes: Scene[]; approximateCount?: boolean }>(
      `/api/subscribed-feed?page=${page}&per_page=${perPage}&window=${window}${sourceParam}${showInLibrary ? "&unadded=0" : ""}${hideParam()}${refresh ? "&refresh=1" : ""}`,
    );
  },
  queryPerformers: (filter: PerformerFilter, refresh = false) =>
    req<PerformerQueryResult>(`/api/performers?${qs(filter)}${refresh ? "&refresh=1" : ""}`),
  listPerformerSearches: () => req<PerformerSearchSummary[]>(`/api/performer-searches`),
  getPerformerSearch: (id: string) => req<SavedPerformerSearch>(`/api/performer-searches/${id}`),
  savePerformerSearch: (name: string, filter: PerformerFilter, results: unknown) =>
    req<SavedPerformerSearch>(`/api/performer-searches`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, filter, results }),
    }),
  updatePerformerSearch: (id: string, patch: { name?: string; filter?: PerformerFilter; results?: unknown }) =>
    req<SavedPerformerSearch>(`/api/performer-searches/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    }),
  deletePerformerSearch: (id: string) => req(`/api/performer-searches/${id}`, { method: "DELETE" }),
  searchTags: (term: string) => req<{ id: string; name: string }[]>(`/api/tags/search?term=${encodeURIComponent(term)}`),
  tagsByIds: (ids: string[]) => (ids.length ? req<{ id: string; name: string }[]>(`/api/tags/byIds?ids=${ids.join(",")}`) : Promise.resolve([])),
  searchPerformers: (term: string) => req<{ id: string; name: string }[]>(`/api/performers/search?term=${encodeURIComponent(term)}`),
  performersByIds: (ids: string[]) =>
    ids.length ? req<{ id: string; name: string }[]>(`/api/performers/byIds?ids=${ids.join(",")}`) : Promise.resolve([]),
  performerDetails: (id: string) => req<PerformerDetails>(`/api/performers/${encodeURIComponent(id)}/details`),
  studioDetails: (id: string) => req<StudioDetails>(`/api/studios/${encodeURIComponent(id)}/details`),
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
  setFilterSubscribed: (id: string, subscribed: boolean) =>
    req<SavedFilter>(`/api/filters/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subscribed }),
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
  authStatus: () => req<{ mode: "off" | "local" | "oidc"; loggedIn: boolean }>(`/api/auth/status`),
  login: (username: string, password: string) =>
    req(`/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    }),
  logout: () => req(`/api/auth/logout`, { method: "POST" }),
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
      authMode: "off" | "local" | "oidc";
      authUsername: string;
      authPasswordSet: boolean;
      oidcIssuer: string;
      oidcClientId: string;
      oidcClientSecretSet: boolean;
      oidcAllowed: string;
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
