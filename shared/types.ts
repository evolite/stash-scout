// Single source of truth for types shared between server/ and frontend/src/api.ts.
// Server-only shapes (SceneQueryInput) and frontend-only shapes (SceneFilter, the
// wire query-string format) live where they're used, not here — they aren't duplicates.

export interface Scene {
  id: string;
  title: string | null;
  release_date: string | null;
  duration: number | null;
  studio: { id: string; name: string } | null;
  tags: { id: string; name: string }[];
  images: { id: string; url: string; width: number; height: number }[];
  performers: { performer: { id: string; name: string; gender: string | null }; as: string | null }[];
  // Set only by queryMergedFeed — which saved filter (or "Favorites") first
  // surfaced this scene, shown as a sash on the scene card in the Watched feed.
  sourceLabel?: string;
}

export interface StashImage {
  url: string;
  width: number;
  height: number;
}

// Detail views for the Performers / Studios tabs — the object you looked up.
export interface PerformerDetails {
  id: string;
  name: string;
  disambiguation: string | null;
  gender: string | null;
  birth_date: string | null;
  age: number | null;
  country: string | null;
  ethnicity: string | null;
  eye_color: string | null;
  hair_color: string | null;
  height: number | null;
  cup_size: string | null;
  band_size: number | null;
  waist_size: number | null;
  hip_size: number | null;
  breast_type: string | null;
  career_start_year: number | null;
  career_end_year: number | null;
  aliases: string[];
  scene_count: number;
  images: StashImage[];
  urls: { url: string; site: { name: string } | null }[];
}

// One row in the "Discover performers" attribute-filter results grid — a subset
// of PerformerDetails plus what queryPerformers returns per performer.
export interface PerformerResult {
  id: string;
  name: string;
  disambiguation: string | null;
  gender: string | null;
  birth_date: string | null;
  age: number | null;
  country: string | null;
  ethnicity: string | null;
  eye_color: string | null;
  hair_color: string | null;
  height: number | null;
  cup_size: string | null;
  career_start_year: number | null;
  career_end_year: number | null;
  scene_count: number;
  images: StashImage[];
  // Used for client-side tattoo/piercing keyword filtering (StashDB won't).
  tattoos?: { location: string | null; description: string | null }[];
  piercings?: { location: string | null; description: string | null }[];
}

export interface StudioDetails {
  id: string;
  name: string;
  aliases: string[];
  parent: { id: string; name: string } | null;
  images: StashImage[];
  urls: { url: string; site: { name: string } | null }[];
}

// Ported from StashSeer's checkIfAvailable/handleDownloadFlow state machine
// (stashseer.js ~1292-1600), collapsed into one server-side status lookup.
export type SceneStatus =
  | { kind: "not-configured" }
  | { kind: "in-stash"; localSceneId: string; localUrl: string }
  | { kind: "not-added"; whisparrConfigured: true }
  | { kind: "not-added"; whisparrConfigured: false }
  | { kind: "previously-added"; movieId: number }
  | { kind: "monitored"; movieId: number }
  | { kind: "downloading"; movieId: number; queue: { size?: number; sizeleft?: number; status?: string } };

export interface SavedFilter<F = Record<string, unknown>> {
  id: string;
  name: string;
  createdAt: string;
  filter: F;
  watched: boolean;
}

// A named performer search: the filter params plus the fetched result list, so
// it can be restored without re-querying StashDB. `results` is the raw
// { count, performers, approximateCount } response for the first page.
export interface SavedPerformerSearch {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  filter: Record<string, unknown>;
  results: unknown;
}

export interface GlobalExcludeTag {
  id: string;
  name: string;
  addedAt: string;
}

export interface IgnoredScene {
  id: string;
  ignoredAt: string;
}

export interface StatsSummary {
  // Whisparr library breakdown — mutually exclusive buckets (except
  // monitoredTotal, which is a cross-cutting count of everything with the
  // monitored flag set). All zero when Whisparr isn't configured.
  totalInWhisparr: number;
  downloaded: number; // has a file
  downloading: number; // in the download queue, no file yet
  wanted: number; // monitored, no file, not downloading
  unmonitored: number; // no file, not monitored (added then unmonitored)
  monitoredTotal: number;
  // Aggregate percent complete (0-100) across all queued items, by bytes;
  // null when nothing is downloading or Whisparr didn't report sizes.
  downloadProgress: number | null;
  ignoredCount: number;
  savedFiltersCount: number;
  watchedFiltersCount: number;
  timeline: { date: string; count: number }[];
}
