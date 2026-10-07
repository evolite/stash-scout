import { Router } from "express";
import type { StashDBClient } from "../stashdbClient.js";
import { parseStashFilter, parsePerformerFilter } from "../filterUtils.js";
import type { AppConfig } from "../config.js";
import type { LocalStashClient } from "../localStashClient.js";
import type { WhisparrClient } from "../whisparrClient.js";
import { getGlobalExcludeIds, mergeExcludeIds, getSubscribedFeed, getIgnoredIds } from "../subscribedFeed.js";
import { fetchFilteredPage, parseHide } from "../statusFilter.js";

export function scenesRouter(stashdb: StashDBClient, cfg: AppConfig, localStash: LocalStashClient, whisparr: WhisparrClient) {
  const router = Router();

  // Global exclude tags (Settings) apply everywhere scenes are fetched — Browse,
  // Subscribed, and Favorites all route through the same queryScenesExcluding path
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
      // fetch — all filtered post-fetch, walking pages like the Subscribed feed
      // already does, only when actually needed.
      const unadded = q.unadded === "1";
      const maxDuration = q.max_duration ? Number(q.max_duration) : undefined;
      const hide = parseHide(q.hide);
      const ignoredIds = getIgnoredIds();
      if (unadded || maxDuration || hide.length > 0 || ignoredIds.size > 0) {
        // Only the first raw fetch of a refresh should bypass the source cache,
        // or each round would wipe the previous round's progress.
        let bypass = refresh;
        const cacheKey = JSON.stringify({ route: "scenes", ...input, page: undefined, per_page: undefined, allExcludes, unadded, maxDuration, hide });
        const result = await fetchFilteredPage(
          cfg,
          { localStash, whisparr },
          (rawPage, pp) => {
            const b = bypass;
            bypass = false;
            return allExcludes.length > 0
              ? stashdb.queryScenesExcluding({ ...input, page: rawPage, per_page: pp }, allExcludes, b)
              : stashdb.queryScenes({ ...input, page: rawPage, per_page: pp }, b);
          },
          page,
          perPage,
          cacheKey,
          { requireUnadded: unadded, maxDurationSeconds: maxDuration, excludeIds: ignoredIds, hide, bypassCache: refresh },
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

  // "Random" charts mode: a random ~2-month slice of StashDB's history,
  // otherwise respecting the same tags/performers/studios/exclude filter,
  // global excludes, ignored scenes, and unadded-only behavior as /scenes.
  // The window itself is picked and cached server-side (see
  // queryScenesRandomWindow) so paging forward stays inside the same slice;
  // `refresh=1` (the section's Refresh button) rerolls a new one.
  router.get("/scenes/random", async (req, res) => {
    try {
      const q = req.query as Record<string, unknown>;
      const { input, excludeTagIds } = parseStashFilter(q);
      const page = q.page ? Number(q.page) : 1;
      const perPage = q.per_page ? Number(q.per_page) : 25;
      const refresh = q.refresh === "1" || q.refresh === "true";
      const allExcludes = mergeExcludeIds(excludeTagIds, getGlobalExcludeIds());
      const unadded = q.unadded === "1";
      const hide = parseHide(q.hide);
      const ignoredIds = getIgnoredIds();

      let bypass = refresh;
      const cacheKey = JSON.stringify({ route: "random", ...input, page: undefined, per_page: undefined, allExcludes, unadded, hide });
      const result = await fetchFilteredPage(
        cfg,
        { localStash, whisparr },
        (rawPage, pp) => {
          const b = bypass;
          bypass = false;
          return stashdb.queryScenesRandomWindow({ ...input, page: rawPage, per_page: pp }, allExcludes, { reset: b, bypassCache: b });
        },
        page,
        perPage,
        cacheKey,
        { requireUnadded: unadded, excludeIds: ignoredIds, hide, bypassCache: refresh },
      );
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

  // Attribute-filtered performer discovery (Filters → Performers sub-tab).
  router.get("/performers", async (req, res) => {
    try {
      const q = req.query as Record<string, unknown>;
      const { input, criteria } = parsePerformerFilter(q);
      const refresh = q.refresh === "1" || q.refresh === "true";
      res.json(await stashdb.queryPerformers(input, criteria, refresh));
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

  router.get("/performers/:id/details", async (req, res) => {
    try {
      const details = await stashdb.findPerformerDetails(String(req.params.id));
      if (!details) return res.status(404).json({ error: "not found" });
      res.json(details);
    } catch (err) {
      res.status(502).json({ error: (err as Error).message });
    }
  });

  router.get("/studios/:id/details", async (req, res) => {
    try {
      const details = await stashdb.findStudioDetails(String(req.params.id));
      if (!details) return res.status(404).json({ error: "not found" });
      res.json(details);
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

  // The Subscribed feed merges every saved filter marked `subscribed: true` plus your
  // favorited StashDB performers (treated as just another source), restricted to
  // scenes released within a window (week/month/year) — this is meant to be a
  // "what's new" feed, not a full archive browse of the same filters. Merge
  // logic lives in subscribedFeed.ts.
  router.get("/subscribed-feed", async (req, res) => {
    try {
      const q = req.query as Record<string, unknown>;
      const page = q.page ? Number(q.page) : 1;
      const perPage = q.per_page ? Number(q.per_page) : 25;
      const window = typeof q.window === "string" ? q.window : "week";
      const refresh = q.refresh === "1" || q.refresh === "true";
      const source = typeof q.source === "string" ? q.source : undefined;
      const unadded = q.unadded !== "0";
      const hide = parseHide(q.hide);
      const result = await getSubscribedFeed({ stashdb, cfg, localStash, whisparr }, { window, page, perPage, refresh, source, unadded, hide });
      res.json(result);
    } catch (err) {
      res.status(502).json({ error: (err as Error).message });
    }
  });

  return router;
}
