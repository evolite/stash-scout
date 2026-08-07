import { Router } from "express";
import type { StashDBClient } from "../stashdbClient.js";
import { parseStashFilter } from "../filterUtils.js";
import type { AppConfig } from "../config.js";
import type { LocalStashClient } from "../localStashClient.js";
import type { WhisparrClient } from "../whisparrClient.js";
import { getGlobalExcludeIds, mergeExcludeIds, getWatchedFeed, getIgnoredIds } from "../watchedFeed.js";
import { fetchFilteredPage } from "../statusFilter.js";

export function scenesRouter(stashdb: StashDBClient, cfg: AppConfig, localStash: LocalStashClient, whisparr: WhisparrClient) {
  const router = Router();

  // Global exclude tags (Settings) apply everywhere scenes are fetched — Browse,
  // Watched, and Favorites all route through the same queryScenesExcluding path
  // rather than each re-implementing tag filtering.
  router.get("/scenes", async (req, res) => {
    try {
      const q = req.query as Record<string, unknown>;
      const { input, excludeTagIds } = parseStashFilter(q);
      const page = q.page ? Number(q.page) : 1;
      const perPage = q.per_page ? Number(q.per_page) : 25;
      input.page = page;
      input.per_page = perPage;
      const refresh = q.refresh === "1" || q.refresh === "true";
      const allExcludes = mergeExcludeIds(excludeTagIds, getGlobalExcludeIds());

      // Trending's "Not in library" / "Under 30 min" chips aren't StashDB query
      // fields, and a Skipped scene needs to actually disappear on the next
      // fetch — all filtered post-fetch, walking pages like the Watched feed
      // already does, only when actually needed.
      const unadded = q.unadded === "1";
      const maxDuration = q.max_duration ? Number(q.max_duration) : undefined;
      const ignoredIds = getIgnoredIds();
      if (unadded || maxDuration || ignoredIds.size > 0) {
        const result = await fetchFilteredPage(
          cfg,
          localStash,
          whisparr,
          (rawPage, pp) =>
            allExcludes.length > 0
              ? stashdb.queryScenesExcluding({ ...input, page: rawPage, per_page: pp }, allExcludes, refresh)
              : stashdb.queryScenes({ ...input, page: rawPage, per_page: pp }, refresh),
          page,
          perPage,
          { requireUnadded: unadded, maxDurationSeconds: maxDuration, excludeIds: ignoredIds },
        );
        res.json(result);
        return;
      }

      const result = allExcludes.length > 0
        ? await stashdb.queryScenesExcluding(input, allExcludes, refresh)
        : await stashdb.queryScenes(input, refresh);
      res.json(result);
    } catch (err) {
      res.status(502).json({ error: (err as Error).message });
    }
  });

  router.get("/tags/search", async (req, res) => {
    try {
      const term = String(req.query.term ?? "");
      res.json(await stashdb.findTags(term));
    } catch (err) {
      res.status(502).json({ error: (err as Error).message });
    }
  });

  router.get("/tags/byIds", async (req, res) => {
    try {
      const ids = String(req.query.ids ?? "").split(",").filter(Boolean);
      res.json(await stashdb.findTagsByIds(ids));
    } catch (err) {
      res.status(502).json({ error: (err as Error).message });
    }
  });

  router.get("/performers/search", async (req, res) => {
    try {
      const term = String(req.query.term ?? "");
      res.json(await stashdb.findPerformers(term));
    } catch (err) {
      res.status(502).json({ error: (err as Error).message });
    }
  });

  router.get("/performers/byIds", async (req, res) => {
    try {
      const ids = String(req.query.ids ?? "").split(",").filter(Boolean);
      res.json(await stashdb.findPerformersByIds(ids));
    } catch (err) {
      res.status(502).json({ error: (err as Error).message });
    }
  });

  router.get("/studios/search", async (req, res) => {
    try {
      const term = String(req.query.term ?? "");
      res.json(await stashdb.findStudios(term));
    } catch (err) {
      res.status(502).json({ error: (err as Error).message });
    }
  });

  router.get("/studios/byIds", async (req, res) => {
    try {
      const ids = String(req.query.ids ?? "").split(",").filter(Boolean);
      res.json(await stashdb.findStudiosByIds(ids));
    } catch (err) {
      res.status(502).json({ error: (err as Error).message });
    }
  });

  // The Watched feed merges every saved filter marked `watched: true` plus your
  // favorited StashDB performers (treated as just another source), restricted to
  // scenes released within a window (week/month/year) — this is meant to be a
  // "what's new" feed, not a full archive browse of the same filters. Merge
  // logic lives in watchedFeed.ts.
  router.get("/watched-feed", async (req, res) => {
    try {
      const q = req.query as Record<string, unknown>;
      const page = q.page ? Number(q.page) : 1;
      const perPage = q.per_page ? Number(q.per_page) : 25;
      const window = String(q.window ?? "week");
      const refresh = q.refresh === "1" || q.refresh === "true";
      const source = typeof q.source === "string" ? q.source : undefined;
      const result = await getWatchedFeed({ stashdb, cfg, localStash, whisparr }, { window, page, perPage, refresh, source });
      res.json(result);
    } catch (err) {
      res.status(502).json({ error: (err as Error).message });
    }
  });

  return router;
}
