import { Router } from "express";
import type { AppConfig } from "../config.js";
import { isWhisparrConfigured } from "../config.js";
import type { WhisparrClient, WhisparrScene, WhisparrQueueItem } from "../whisparrClient.js";
import { db } from "../db.js";
import type { StatsSummary } from "../../shared/types.js";

const RECENT_LIMIT = 10;

// Mirrors stateMachine.ts's per-scene bucketing (hasFile/queue/monitored), run
// once over the whole list instead of once per scene id.
function classifyMovies(movies: WhisparrScene[], queue: WhisparrQueueItem[]) {
  const queuedMovieIds = new Set(queue.map((q) => q.movieId));
  let monitored = 0;
  let downloading = 0;
  let previouslyAdded = 0;
  for (const m of movies) {
    if (m.hasFile) monitored++;
    else if (queuedMovieIds.has(m.id)) downloading++;
    else if (m.monitored) monitored++;
    else previouslyAdded++;
  }
  return { monitored, downloading, previouslyAdded };
}

export function statsRouter(cfg: AppConfig, whisparr: WhisparrClient) {
  const router = Router();

  router.get("/stats", async (_req, res) => {
    try {
      let counts = { monitored: 0, downloading: 0, previouslyAdded: 0 };
      let recentlyAdded: StatsSummary["recentlyAdded"] = [];

      if (isWhisparrConfigured(cfg)) {
        const { movies, queue } = await whisparr.getBulkStatusSource();
        counts = classifyMovies(movies, queue);
        recentlyAdded = movies
          .filter((m): m is WhisparrScene & { added: string } => !!m.added)
          .sort((a, b) => (a.added < b.added ? 1 : -1))
          .slice(0, RECENT_LIMIT)
          .map((m) => ({ id: m.id, title: m.title ?? "(untitled)", addedAt: m.added }));
      }

      const ignoredCount = (db.prepare("SELECT COUNT(*) as c FROM ignored_scenes").get() as { c: number }).c;
      const filterCounts = db.prepare("SELECT COUNT(*) as total, SUM(watched) as watched FROM filters").get() as {
        total: number;
        watched: number | null;
      };

      const summary: StatsSummary = {
        ...counts,
        ignoredCount,
        savedFiltersCount: filterCounts.total,
        watchedFiltersCount: filterCounts.watched ?? 0,
        recentlyAdded,
      };
      res.json(summary);
    } catch (err) {
      res.status(502).json({ error: (err as Error).message });
    }
  });

  return router;
}
