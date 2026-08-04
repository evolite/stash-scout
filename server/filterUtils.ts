import type { SceneQueryInput } from "./stashdbClient.js";

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
  const excludeTagIds = typeof q.exclude_tags === "string" && q.exclude_tags ? q.exclude_tags.split(",") : [];
  return { input, excludeTagIds };
}
