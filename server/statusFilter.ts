import type { AppConfig } from "./config.js";
import type { LocalStashClient } from "./localStashClient.js";
import type { WhisparrClient } from "./whisparrClient.js";
import type { Scene } from "../shared/types.js";
import { getSceneStatus } from "./stateMachine.js";

// Shared by Watched and Favorites: both are "what's new to act on" feeds where
// scenes already playable (in Stash) or already added to Whisparr in any form
// don't belong.
const ALREADY_ADDED_KINDS = new Set(["in-stash", "monitored", "previously-added", "downloading"]);
const MAX_STATUS_ROUNDS = 5;

// Walks raw (StashDB-side) pages via fetchRawPage, dropping already-added
// scenes, until there's enough to fill the requested page or the source runs
// out — bounded by MAX_STATUS_ROUNDS since local Stash/Whisparr checks aren't
// rate-limited but StashDB pages still cost a call the first time they're
// fetched (callers are expected to cache internally, as queryScenes/
// queryMergedFeed already do).
export async function fetchUnaddedPage(
  cfg: AppConfig,
  localStash: LocalStashClient,
  whisparr: WhisparrClient,
  fetchRawPage: (rawPage: number, perPage: number) => Promise<{ scenes: Scene[] }>,
  page: number,
  perPage: number,
): Promise<{ count: number; scenes: Scene[]; approximateCount: boolean }> {
  const skip = (page - 1) * perPage;
  const visible: Scene[] = [];
  let exhausted = false;

  for (let round = 0, rawPage = 1; round < MAX_STATUS_ROUNDS && visible.length < skip + perPage; round++, rawPage++) {
    const raw = await fetchRawPage(rawPage, perPage);
    if (raw.scenes.length === 0) {
      exhausted = true;
      break;
    }
    const statuses = await Promise.all(raw.scenes.map((s) => getSceneStatus(cfg, s.id, { localStash, whisparr })));
    raw.scenes.forEach((scene, i) => {
      if (!ALREADY_ADDED_KINDS.has(statuses[i].kind)) visible.push(scene);
    });
    if (raw.scenes.length < perPage) {
      exhausted = true;
      break;
    }
  }

  return {
    count: exhausted ? visible.length : visible.length + 1,
    scenes: visible.slice(skip, skip + perPage),
    approximateCount: !exhausted,
  };
}
