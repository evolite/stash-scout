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
  let downloaded = 0;
  let downloading = 0;
  let wanted = 0;
  let unmonitored = 0;
  let monitoredTotal = 0;
  for (const m of movies) {
    if (m.monitored) monitoredTotal++;
    if (m.hasFile) downloaded++;
    else if (queuedMovieIds.has(m.id)) downloading++;
    else if (m.monitored) wanted++;
    else unmonitored++;
  }
  return { totalInWhisparr: movies.length, downloaded, downloading, wanted, unmonitored, monitoredTotal };
}

// Bytes-weighted so a mostly-done large file counts more than a barely-started
// small one; null when Whisparr hasn't reported sizes yet (item just queued).
function aggregateDownloadProgress(queue: WhisparrQueueItem[]): number | null {
  let totalSize = 0;
  let totalRemaining = 0;
  for (const q of queue) {
    if (!q.size) continue;
    totalSize += q.size;
    totalRemaining += q.sizeleft ?? 0;
  }
  if (totalSize === 0) return null;
  return Math.round(((totalSize - totalRemaining) / totalSize) * 100);
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
      let counts = { totalInWhisparr: 0, downloaded: 0, downloading: 0, wanted: 0, unmonitored: 0, monitoredTotal: 0 };
      let timeline: StatsSummary["timeline"] = [];
      let downloadProgress: number | null = null;

      if (isWhisparrConfigured(cfg)) {
        const { movies, queue } = await whisparr.getBulkStatusSource();
        counts = classifyMovies(movies, queue);
        timeline = buildTimeline(movies);
        downloadProgress = aggregateDownloadProgress(queue);
      }

      const ignoredCount = (db.prepare("SELECT COUNT(*) as c FROM ignored_scenes").get() as { c: number }).c;
      const filterCounts = db.prepare("SELECT COUNT(*) as total, SUM(watched) as subscribed FROM filters").get() as {
        total: number;
        subscribed: number | null;
      };

      const summary: StatsSummary = {
        ...counts,
        downloadProgress,
        ignoredCount,
        savedFiltersCount: filterCounts.total,
        subscribedFiltersCount: filterCounts.subscribed ?? 0,
        timeline,
      };
      res.json(summary);
    } catch (err) {
      res.status(502).json({ error: (err as Error).message });
    }
  });

  return router;
}
