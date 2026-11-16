import type { AppConfig } from "./config.js";
import { isWhisparrConfigured } from "./config.js";
import type { StashDBClient } from "./stashdbClient.js";
import type { LocalStashClient } from "./localStashClient.js";
import type { WhisparrClient } from "./whisparrClient.js";
import { getSubscribedFeed } from "./subscribedFeed.js";

const TICK_INTERVAL_MS = 60 * 60_000;
const FIRST_TICK_DELAY_MS = 60_000;
const MAX_FAILURES = 3;
const PER_TICK_LIMIT = 25;

export function startAutoAdd(
  cfg: AppConfig,
  deps: { stashdb: StashDBClient; localStash: LocalStashClient; whisparr: WhisparrClient },
): void {
  let running = false;
  const failures = new Map<string, number>();
  const tick = async () => {
    if (running) return;
    if (!isWhisparrConfigured(cfg) || !cfg.whisparrRootFolderPath || typeof cfg.whisparrQualityProfileId !== "number") return;
    running = true;
    try {
      const { scenes } = await getSubscribedFeed(
        { stashdb: deps.stashdb, cfg, localStash: deps.localStash, whisparr: deps.whisparr },
        { window: "week", page: 1, perPage: PER_TICK_LIMIT, unadded: true, autoAddOnly: true },
      );
      for (const scene of scenes) {
        if ((failures.get(scene.id) ?? 0) >= MAX_FAILURES) continue;
        try {
          await deps.whisparr.addScene(scene.id); // NOSONAR
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
  setInterval(() => void tick(), TICK_INTERVAL_MS).unref();
  setTimeout(() => void tick(), FIRST_TICK_DELAY_MS).unref();
}
