import { Router } from "express";
import type { StashDBClient, Scene } from "../stashdbClient.js";
import { parseStashFilter } from "../filterUtils.js";
import { readJson } from "../store.js";
import type { SavedFilter } from "./filters.js";
import type { IgnoredScene } from "./ignoredScenes.js";
import type { AppConfig } from "../config.js";
import type { LocalStashClient } from "../localStashClient.js";
import type { WhisparrClient } from "../whisparrClient.js";
import { getSceneStatus } from "../stateMachine.js";

// Watched is a "what's new to act on" feed — scenes already playable (in Stash)
// or already added to Whisparr in any form don't belong there.
const ALREADY_ADDED_KINDS = new Set(["in-stash", "monitored", "previously-added", "downloading"]);
const MAX_STATUS_ROUNDS = 5;

export function scenesRouter(stashdb: StashDBClient, cfg: AppConfig, localStash?: LocalStashClient, whisparr?: WhisparrClient) {
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
      const skip = (page - 1) * perPage;

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
      const ignoredIds = new Set((await readJson<IgnoredScene[]>("ignored-scenes.json", [])).map((s) => s.id));

      // Walk raw (StashDB-side) pages, dropping already-added scenes, until we've
      // collected enough for this page or run out — bounded by MAX_STATUS_ROUNDS
      // since local Stash/Whisparr checks aren't rate-limited but StashDB pages
      // still cost a call the first time they're fetched (cached after that).
      const visible: Scene[] = [];
      let exhausted = false;
      for (let round = 0, rawPage = 1; round < MAX_STATUS_ROUNDS && visible.length < skip + perPage; round++, rawPage++) {
        const raw = await stashdb.queryMergedFeed(sources, rawPage, perPage, cacheKey, ignoredIds);
        if (raw.scenes.length === 0) {
          exhausted = true;
          break;
        }
        const statuses = await Promise.all(raw.scenes.map((s) => getSceneStatus(cfg, s.id, { localStash, whisparr })));
        raw.scenes.forEach((scene, i) => {
          if (!ALREADY_ADDED_KINDS.has(statuses[i].kind)) visible.push(scene);
        });
        if (raw.scenes.length < perPage) {
          exhausted = true;
          break;
        }
      }

      res.json({
        count: exhausted ? visible.length : visible.length + 1,
        scenes: visible.slice(skip, skip + perPage),
        approximateCount: !exhausted,
      });
    } catch (err) {
      res.status(502).json({ error: (err as Error).message });
    }
  });

  return router;
}
