import type { SceneQueryInput, PerformerQueryInput, PerformerClientCriteria } from "./stashdbClient.js";

// Shared between the ad-hoc /api/scenes query-string filter and a saved filter's
// stored JSON — both are the same field shape (frontend's SceneFilter, serialized
// to strings), so one parser covers both sources.
export function parseStashFilter(q: Record<string, unknown>): { input: Partial<SceneQueryInput>; excludeTagIds: string[] } {
  const input: Partial<SceneQueryInput> = {
    sort: typeof q.sort === "string" ? q.sort : "DATE",
    direction: (typeof q.direction === "string" ? q.direction : "DESC") as "ASC" | "DESC",
  };
  if (typeof q.text === "string" && q.text) input.text = q.text;
  if (typeof q.tags === "string" && q.tags) {
    input.tags = { value: q.tags.split(","), modifier: (q.tags_modifier as any) || "INCLUDES_ALL" };
  }
  if (typeof q.performers === "string" && q.performers) {
    input.performers = { value: q.performers.split(","), modifier: "INCLUDES_ALL" };
  }
  if (typeof q.studios === "string" && q.studios) {
    input.studios = { value: q.studios.split(","), modifier: "INCLUDES" };
  }
  if (typeof q.date === "string" && q.date) {
    input.date = { value: q.date, modifier: (q.date_modifier as any) || "EQUALS" };
  }
  if (q.favorites === "PERFORMER" || q.favorites === "STUDIO" || q.favorites === "ALL") {
    input.favorites = q.favorites;
  }
  const excludeTagIds = typeof q.exclude_tags === "string" && q.exclude_tags ? q.exclude_tags.split(",") : [];
  return { input, excludeTagIds };
}

// Flat query string from the "Discover performers" sidebar -> a StashDB-native
// `input` plus the `criteria` we filter ourselves (see queryPerformers).
// `birth_year` takes GREATER_THAN (after) / LESS_THAN (before), default after;
// `height` also allows EQUALS. tattoos/piercings are "yes" | "no".
// after/before only (birth year)
function twoWayModifier(m: unknown): "LESS_THAN" | "GREATER_THAN" {
  return m === "LESS_THAN" ? "LESS_THAN" : "GREATER_THAN";
}
// ≥ / ≤ / = (height, cup size); default ≥
function threeWayModifier(m: unknown): string {
  return m === "LESS_THAN" || m === "EQUALS" ? (m as string) : "GREATER_THAN";
}
function yesNo(v: unknown): boolean | undefined {
  if (v === "yes") return true;
  if (v === "no") return false;
  return undefined;
}

type Str = (k: string) => string | undefined;

// The StashDB-native half of the performer filter (gender/ethnicity/country/
// birth year/favourite — everything its API actually filters on).
function parsePerformerInput(q: Record<string, unknown>, str: Str): Partial<PerformerQueryInput> {
  const input: Partial<PerformerQueryInput> = {
    sort: str("sort") ?? "SCENE_COUNT",
    direction: (str("direction") ?? "DESC") as "ASC" | "DESC",
    page: q.page ? Number(q.page) : 1,
    per_page: q.per_page ? Number(q.per_page) : 40,
  };
  if (str("name")) input.name = str("name");
  if (str("gender")) input.gender = str("gender");
  if (str("ethnicity")) input.ethnicity = str("ethnicity");
  if (str("country")) input.country = { value: str("country")!, modifier: "EQUALS" };
  if (str("birth_year")) {
    input.birth_year = { value: Number(str("birth_year")), modifier: twoWayModifier(q.birth_year_modifier) };
  }
  if (q.is_favorite === "1" || q.is_favorite === "true") input.is_favorite = true;
  return input;
}

// The half we filter ourselves by paging StashDB's results (see queryPerformers).
function parsePerformerCriteria(q: Record<string, unknown>, str: Str): PerformerClientCriteria {
  const criteria: PerformerClientCriteria = {};
  if (str("eye_color")) criteria.eye_color = str("eye_color");
  if (str("hair_color")) criteria.hair_color = str("hair_color");
  if (str("cup_size")) {
    criteria.cup_size = { value: str("cup_size")!, modifier: threeWayModifier(q.cup_size_modifier) };
  }
  if (str("height")) {
    criteria.height = { value: Number(str("height")), modifier: threeWayModifier(q.height_modifier) };
  }
  const tattoos = yesNo(q.tattoos);
  if (tattoos !== undefined) criteria.hasTattoos = tattoos;
  const piercings = yesNo(q.piercings);
  if (piercings !== undefined) criteria.hasPiercings = piercings;
  return criteria;
}

// Flat query string from the "Discover performers" sidebar -> a StashDB-native
// `input` plus the `criteria` we filter ourselves.
export function parsePerformerFilter(q: Record<string, unknown>): {
  input: Partial<PerformerQueryInput>;
  criteria: PerformerClientCriteria;
} {
  const str: Str = (k) => (typeof q[k] === "string" && q[k] ? (q[k] as string) : undefined);
  return { input: parsePerformerInput(q, str), criteria: parsePerformerCriteria(q, str) };
}
