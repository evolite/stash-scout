import { Router } from "express";
import type { AppConfig } from "../config.js";
import { isWhisparrConfigured } from "../config.js";
import type { WhisparrClient, WhisparrScene, WhisparrQueueItem } from "../whisparrClient.js";
import { db } from "../db.js";
import type { StatsSummary } from "../../shared/types.js";

const TIMELINE_DAYS = 30;

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

// Dense day-by-day series (zero-filled) over the trailing TIMELINE_DAYS window,
// so the chart shows gaps instead of only the days something was added.
function buildTimeline(movies: WhisparrScene[]): StatsSummary["timeline"] {
  const countsByDay = new Map<string, number>();
  for (const m of movies) {
    if (!m.added) continue;
    const day = m.added.slice(0, 10);
    countsByDay.set(day, (countsByDay.get(day) ?? 0) + 1);
  }
  const timeline: StatsSummary["timeline"] = [];
  const today = new Date();
  for (let i = TIMELINE_DAYS - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() - i);
    const day = d.toISOString().slice(0, 10);
    timeline.push({ date: day, count: countsByDay.get(day) ?? 0 });
  }
  return timeline;
}

export function statsRouter(cfg: AppConfig, whisparr: WhisparrClient) {
  const router = Router();

  router.get("/stats", async (_req, res) => {
    try {
      let counts = { monitored: 0, downloading: 0, previouslyAdded: 0 };
      let timeline: StatsSummary["timeline"] = [];

      if (isWhisparrConfigured(cfg)) {
        const { movies, queue } = await whisparr.getBulkStatusSource();
        counts = classifyMovies(movies, queue);
        timeline = buildTimeline(movies);
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
        timeline,
      };
      res.json(summary);
    } catch (err) {
      res.status(502).json({ error: (err as Error).message });
    }
  });

  return router;
}
