import { Router } from "express";
import type { StashDBClient } from "../stashdbClient.js";
import { parseStashFilter } from "../filterUtils.js";
import { readJson } from "../store.js";
import type { SavedFilter } from "./filters.js";

export function scenesRouter(stashdb: StashDBClient) {
  const router = Router();

  router.get("/scenes", async (req, res) => {
    try {
      const q = req.query as Record<string, unknown>;
      const { input, excludeTagIds } = parseStashFilter(q);
      input.page = q.page ? Number(q.page) : 1;
      input.per_page = q.per_page ? Number(q.per_page) : 25;
      const result = excludeTagIds.length > 0 ? await stashdb.queryScenesExcluding(input, excludeTagIds) : await stashdb.queryScenes(input);
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

  // The Watched feed merges every saved filter marked `watched: true`, restricted
  // to scenes released in the last 30 days — this is meant to be a "what's new"
  // feed, not a full archive browse of the same filters.
  const WATCHED_WINDOW_DAYS = 30;
  router.get("/watched-feed", async (req, res) => {
    try {
      const q = req.query as Record<string, unknown>;
      const page = q.page ? Number(q.page) : 1;
      const perPage = q.per_page ? Number(q.per_page) : 25;

      const watchedFilters = (await readJson<SavedFilter[]>("filters.json", [])).filter((f) => f.watched);
      if (watchedFilters.length === 0) {
        res.json({ count: 0, scenes: [], approximateCount: false });
        return;
      }

      const cutoff = new Date(Date.now() - WATCHED_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const sources = watchedFilters.map((f) => {
        const { input, excludeTagIds } = parseStashFilter(f.filter as Record<string, unknown>);
        input.date = { value: cutoff, modifier: "GREATER_THAN" };
        return { input, excludeTagIds };
      });
      // cutoff (changes daily) is folded into the cache key so the window rolls
      // forward instead of serving yesterday's cached results indefinitely.
      const cacheKey = JSON.stringify({ cutoff, filters: watchedFilters.map((f) => ({ id: f.id, filter: f.filter })) });
      const result = await stashdb.queryMergedFeed(sources, page, perPage, cacheKey);
      res.json(result);
    } catch (err) {
      res.status(502).json({ error: (err as Error).message });
    }
  });

  return router;
}
