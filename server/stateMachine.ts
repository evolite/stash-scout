import type { AppConfig } from "./config.js";
import { isLocalStashConfigured, isWhisparrConfigured } from "./config.js";
import { LocalStashClient } from "./localStashClient.js";
import { WhisparrClient } from "./whisparrClient.js";

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

export async function getSceneStatus(
  cfg: AppConfig,
  stashId: string,
  clients: { localStash?: LocalStashClient; whisparr?: WhisparrClient },
): Promise<SceneStatus> {
  const stashEnabled = isLocalStashConfigured(cfg) && !!clients.localStash;
  const whisparrEnabled = isWhisparrConfigured(cfg) && !!clients.whisparr;

  if (!stashEnabled && !whisparrEnabled) {
    return { kind: "not-configured" };
  }

  if (stashEnabled) {
    const localSceneId = await clients.localStash!.findSceneIdByStashId(stashId);
    if (localSceneId) {
      return { kind: "in-stash", localSceneId, localUrl: `${cfg.localStashRootUrl}/scenes/${localSceneId}` };
    }
  }

  if (!whisparrEnabled) {
    return { kind: "not-added", whisparrConfigured: false };
  }

  const movie = await clients.whisparr!.getSceneByStashId(stashId);
  if (!movie) {
    return { kind: "not-added", whisparrConfigured: true };
  }

  if (movie.hasFile) {
    // Has a file in Whisparr but not matched into local Stash yet (not scanned/synced) — monitored state.
    return { kind: "monitored", movieId: movie.id };
  }

  const queueItem = await clients.whisparr!.getQueueForMovie(movie.id);
  if (queueItem) {
    return {
      kind: "downloading",
      movieId: movie.id,
      queue: { size: queueItem.size, sizeleft: queueItem.sizeleft, status: queueItem.status },
    };
  }

  if (movie.monitored) {
    return { kind: "monitored", movieId: movie.id };
  }

  return { kind: "previously-added", movieId: movie.id };
}
