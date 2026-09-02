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
export function parsePerformerFilter(q: Record<string, unknown>): {
  input: Partial<PerformerQueryInput>;
  criteria: PerformerClientCriteria;
} {
  const str = (k: string) => (typeof q[k] === "string" && q[k] ? (q[k] as string) : undefined);
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
    input.birth_year = {
      value: Number(str("birth_year")),
      modifier: q.birth_year_modifier === "LESS_THAN" ? "LESS_THAN" : "GREATER_THAN",
    };
  }
  if (q.is_favorite === "1" || q.is_favorite === "true") input.is_favorite = true;

  const criteria: PerformerClientCriteria = {};
  if (str("eye_color")) criteria.eye_color = str("eye_color");
  if (str("hair_color")) criteria.hair_color = str("hair_color");
  if (str("cup_size")) {
    const m = q.cup_size_modifier;
    criteria.cup_size = {
      value: str("cup_size")!,
      modifier: m === "LESS_THAN" || m === "EQUALS" ? (m as string) : "GREATER_THAN",
    };
  }
  if (str("height")) {
    const m = q.height_modifier;
    criteria.height = {
      value: Number(str("height")),
      modifier: m === "LESS_THAN" || m === "EQUALS" ? (m as string) : "GREATER_THAN",
    };
  }
  if (q.tattoos === "yes") criteria.hasTattoos = true;
  else if (q.tattoos === "no") criteria.hasTattoos = false;
  if (q.piercings === "yes") criteria.hasPiercings = true;
  else if (q.piercings === "no") criteria.hasPiercings = false;

  return { input, criteria };
}
