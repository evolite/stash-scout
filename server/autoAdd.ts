import type { AppConfig } from "./config.js";
import { isWhisparrConfigured } from "./config.js";
import type { StashDBClient } from "./stashdbClient.js";
import type { LocalStashClient } from "./localStashClient.js";
import type { WhisparrClient } from "./whisparrClient.js";
import { getSubscribedFeed } from "./subscribedFeed.js";

const TICK_INTERVAL_MS = 60 * 60_000; // hourly
const FIRST_TICK_DELAY_MS = 60_000; // let the server settle after boot
const MAX_FAILURES = 3; // skip a scene after this many failed adds
const PER_TICK_LIMIT = 25; // backlog beyond this drains over the next ticks

// Hourly background job: adds new scenes from auto-monitor-opted-in subscriptions
// (and Favorites, if its setting is on) to Whisparr. The feed is already
// "unadded only", so added scenes drop out and re-running is idempotent;
// ignored scenes and paused filters never appear. Failures log and retry next
// tick — nothing remembers them.
export function startAutoAdd(
  cfg: AppConfig,
  deps: { stashdb: StashDBClient; localStash: LocalStashClient; whisparr: WhisparrClient },
): void {
  let running = false;
  // In-memory (resets on restart): stops re-posting a scene Whisparr keeps
  // rejecting every hour. ponytail: it still occupies a page-1 slot — page past
  // failures if a stuck scene ever starves the backlog.
  const failures = new Map<string, number>();
  const tick = async () => {
    if (running) return;
    // Same precondition addScene enforces — a half-configured Whisparr would
    // fail every single add anyway.
    if (!isWhisparrConfigured(cfg) || !cfg.whisparrRootFolderPath || typeof cfg.whisparrQualityProfileId !== "number") return;
    running = true;
    try {
      // ponytail: fixed week window + one page per tick; widen only if
      // PER_TICK_LIMIT/hour proves too slow for a real backlog.
      const { scenes } = await getSubscribedFeed(
        { stashdb: deps.stashdb, cfg, localStash: deps.localStash, whisparr: deps.whisparr },
        { window: "week", page: 1, perPage: PER_TICK_LIMIT, unadded: true, autoAddOnly: true },
      );
      for (const scene of scenes) {
        if ((failures.get(scene.id) ?? 0) >= MAX_FAILURES) continue;
        try {
          await deps.whisparr.addScene(scene.id);
          console.log(`auto-monitor: "${scene.title ?? scene.id}" → Whisparr`);
        } catch (err) {
          failures.set(scene.id, (failures.get(scene.id) ?? 0) + 1);
          console.warn(`auto-monitor: failed to add ${scene.id}:`, (err as Error).message);
        }
      }
    } catch (err) {
      console.warn("auto-monitor tick failed:", (err as Error).message);
    } finally {
      running = false;
    }
  };
  // The whole tick is try/caught — index.ts exits the process on an
  // unhandledRejection, so nothing here may escape.
  setInterval(() => void tick(), TICK_INTERVAL_MS).unref();
  setTimeout(() => void tick(), FIRST_TICK_DELAY_MS).unref();
}
