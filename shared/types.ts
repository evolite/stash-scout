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
  performers: { performer: { id: string; name: string }; as: string | null }[];
  // Set only by queryMergedFeed — which saved filter (or "Favorites") first
  // surfaced this scene, shown as a sash on the scene card in the Watched feed.
  sourceLabel?: string;
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
  monitored: number;
  downloading: number;
  previouslyAdded: number;
  ignoredCount: number;
  savedFiltersCount: number;
  watchedFiltersCount: number;
  timeline: { date: string; count: number }[];
}
