export interface Scene {
  id: string;
  title: string | null;
  release_date: string | null;
  duration: number | null;
  studio: { id: string; name: string } | null;
  tags: { id: string; name: string }[];
  images: { id: string; url: string; width: number; height: number }[];
  performers: { performer: { id: string; name: string; gender: string | null }; as: string | null }[];
  sourceLabel?: string;
}

export interface StashImage {
  url: string;
  width: number;
  height: number;
}

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
  subscribed: boolean;
  autoAdd: boolean;
}

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
  totalInWhisparr: number;
  downloaded: number;
  downloading: number;
  wanted: number;
  unmonitored: number;
  monitoredTotal: number;
  downloadProgress: number | null;
  ignoredCount: number;
  savedFiltersCount: number;
  subscribedFiltersCount: number;
  timeline: { date: string; count: number }[];
}
