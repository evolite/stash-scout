import type { AppConfig } from "./config.js";
import type { LocalStashClient } from "./localStashClient.js";
import type { WhisparrClient } from "./whisparrClient.js";
import type { Scene } from "../shared/types.js";
import { getSceneStatus } from "./stateMachine.js";
import { capMap } from "./cacheUtil.js";

// Shared by Subscribed and Favorites: both are "what's new to act on" feeds where
// scenes already playable (in Stash) or already added to Whisparr in any form
// don't belong.
const ALREADY_ADDED_KINDS = new Set(["in-stash", "monitored", "previously-added", "downloading"]);
const RAW_PAGE_SIZE = 40; // StashDB's max per_page
// New raw pages scanned per request. The cursor below persists, so a page that
// didn't fill within budget resumes on the next request (or the UI's
// next-page prefetch) instead of restarting from raw page 1.
const SCAN_BUDGET = Number(process.env.STASHDB_FILTER_SCAN_BUDGET ?? 5);
const CURSOR_TTL_MS = 5 * 60_000;
const CURSOR_MAX_ENTRIES = 200;

export type Orientation = "gay" | "lesbian" | "straight";

interface Cursor {
  visible: Scene[];
  seen: Set<string>;
  rawPage: number;
  exhausted: boolean;
  at: number;
}
const cursors = new Map<string, Cursor>();

export function parseHide(v: unknown): Orientation[] {
  return typeof v === "string" ? (v.split(",").filter((o) => o === "gay" || o === "lesbian" || o === "straight") as Orientation[]) : [];
}

// Only MALE/FEMALE count; a scene with no clear all-male / all-female /
// mixed signal is always kept.
function orientationHidden(scene: Scene, hide: Orientation[]): boolean {
  if (hide.length === 0) return false;
  const genders = new Set(scene.performers.map((p) => p.performer.gender));
  const f = genders.has("FEMALE");
  const m = genders.has("MALE");
  let o: Orientation | null = null;
  if (m && f) o = "straight";
  else if (m) o = "gay";
  else if (f) o = "lesbian";
  return o !== null && hide.includes(o);
}

// Accumulates the post-filter scene list per filter (cacheKey) across
// requests, walking raw (StashDB-side) pages from where the last request
// stopped — filtering after StashDB's own pagination means page N's contents
// depend on everything before it, so restarting from raw page 1 each time
// (with a fixed round cap) left deep pages empty. A source that returns a
// short page while still `approximateCount` just ran out of its own budget:
// the same raw page is re-read next time, `seen` drops the repeats.
export async function fetchFilteredPage(
  cfg: AppConfig,
  clients: { localStash: LocalStashClient; whisparr: WhisparrClient },
  fetchRawPage: (rawPage: number, perPage: number) => Promise<{ scenes: Scene[]; approximateCount?: boolean }>,
  page: number,
  perPage: number,
  cacheKey: string,
  opts: { requireUnadded?: boolean; maxDurationSeconds?: number; excludeIds?: Set<string>; hide?: Orientation[]; bypassCache?: boolean } = {},
): Promise<{ count: number; scenes: Scene[]; approximateCount: boolean }> {
  const skip = (page - 1) * perPage;
  if (opts.bypassCache) cursors.delete(cacheKey);
  let entry = cursors.get(cacheKey);
  if (!entry || Date.now() - entry.at > CURSOR_TTL_MS) {
    entry = { visible: [], seen: new Set(), rawPage: 1, exhausted: false, at: Date.now() };
    cursors.set(cacheKey, entry);
    capMap(cursors, CURSOR_MAX_ENTRIES);
  }
  // Re-applied on read so a scene skipped after being cached disappears now.
  const visible = () => (opts.excludeIds?.size ? entry!.visible.filter((s) => !opts.excludeIds!.has(s.id)) : entry!.visible);

  for (let round = 0; round < SCAN_BUDGET && !entry.exhausted && visible().length < skip + perPage; round++) {
    const raw = await fetchRawPage(entry.rawPage, RAW_PAGE_SIZE);
    const fresh = raw.scenes.filter((s) => !entry!.seen.has(s.id));
    fresh.forEach((s) => entry!.seen.add(s.id));
    const statuses = opts.requireUnadded
      ? await Promise.all(fresh.map((s) => getSceneStatus(cfg, s.id, clients)))
      : null;
    fresh.forEach((scene, i) => {
      if (statuses && ALREADY_ADDED_KINDS.has(statuses[i].kind)) return;
      if (opts.maxDurationSeconds && (!scene.duration || scene.duration > opts.maxDurationSeconds)) return;
      if (orientationHidden(scene, opts.hide ?? [])) return;
      entry!.visible.push(scene);
    });
    if (raw.scenes.length === RAW_PAGE_SIZE) entry.rawPage++;
    else if (raw.approximateCount) break;
    else entry.exhausted = true;
  }

  const all = visible();
  return {
    count: entry.exhausted ? all.length : all.length + 1,
    scenes: all.slice(skip, skip + perPage),
    approximateCount: !entry.exhausted,
  };
}
