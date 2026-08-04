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

  // The Watched feed merges every saved filter marked `watched: true`.
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

      const sources = watchedFilters.map((f) => parseStashFilter(f.filter as Record<string, unknown>));
      const cacheKey = JSON.stringify(watchedFilters.map((f) => ({ id: f.id, filter: f.filter })));
      const result = await stashdb.queryMergedFeed(sources, page, perPage, cacheKey);
      res.json(result);
    } catch (err) {
      res.status(502).json({ error: (err as Error).message });
    }
  });

  return router;
}
