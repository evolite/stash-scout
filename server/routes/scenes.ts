import { Router } from "express";
import type { StashDBClient } from "../stashdbClient.js";
import { parseStashFilter } from "../filterUtils.js";
import { readJson } from "../store.js";
import type { SavedFilter } from "./filters.js";
import type { IgnoredScene } from "./ignoredScenes.js";
import type { GlobalExcludeTag } from "./globalExcludeTags.js";
import type { AppConfig } from "../config.js";
import type { LocalStashClient } from "../localStashClient.js";
import type { WhisparrClient } from "../whisparrClient.js";
import { fetchUnaddedPage } from "../statusFilter.js";

async function getGlobalExcludeIds(): Promise<string[]> {
  return (await readJson<GlobalExcludeTag[]>("global-exclude-tags.json", [])).map((t) => t.id);
}

function mergeExcludeIds(a: string[], b: string[]): string[] {
  return [...new Set([...a, ...b])];
}

export function scenesRouter(stashdb: StashDBClient, cfg: AppConfig, localStash: LocalStashClient, whisparr: WhisparrClient) {
  const router = Router();

  // Global exclude tags (Settings) apply everywhere scenes are fetched — Browse,
  // Watched, and Favorites all route through the same queryScenesExcluding path
  // rather than each re-implementing tag filtering.
  router.get("/scenes", async (req, res) => {
    try {
      const q = req.query as Record<string, unknown>;
      const { input, excludeTagIds } = parseStashFilter(q);
      input.page = q.page ? Number(q.page) : 1;
      input.per_page = q.per_page ? Number(q.per_page) : 25;
      const allExcludes = mergeExcludeIds(excludeTagIds, await getGlobalExcludeIds());
      const result = allExcludes.length > 0 ? await stashdb.queryScenesExcluding(input, allExcludes) : await stashdb.queryScenes(input);
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
  // to scenes released within a window (week/month/year) — this is meant to be a
  // "what's new" feed, not a full archive browse of the same filters.
  const WATCHED_WINDOW_DAYS: Record<string, number> = { week: 7, month: 30, year: 365 };
  router.get("/watched-feed", async (req, res) => {
    try {
      const q = req.query as Record<string, unknown>;
      const page = q.page ? Number(q.page) : 1;
      const perPage = q.per_page ? Number(q.per_page) : 25;
      const windowDays = WATCHED_WINDOW_DAYS[String(q.window ?? "week")] ?? WATCHED_WINDOW_DAYS.week;

      const watchedFilters = (await readJson<SavedFilter[]>("filters.json", [])).filter((f) => f.watched);
      if (watchedFilters.length === 0) {
        res.json({ count: 0, scenes: [], approximateCount: false });
        return;
      }

      const globalExcludes = await getGlobalExcludeIds();
      const cutoff = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const sources = watchedFilters.map((f) => {
        const { input, excludeTagIds } = parseStashFilter(f.filter as Record<string, unknown>);
        input.date = { value: cutoff, modifier: "GREATER_THAN" };
        return { input, excludeTagIds: mergeExcludeIds(excludeTagIds, globalExcludes) };
      });
      // cutoff (changes daily) and the global excludes are folded into the cache
      // key so the window rolls forward and a Settings change is picked up
      // immediately instead of serving a stale cached merge.
      const cacheKey = JSON.stringify({ cutoff, globalExcludes, filters: watchedFilters.map((f) => ({ id: f.id, filter: f.filter })) });
      const ignoredIds = new Set((await readJson<IgnoredScene[]>("ignored-scenes.json", [])).map((s) => s.id));

      const result = await fetchUnaddedPage(
        cfg,
        localStash,
        whisparr,
        (rawPage, pp) => stashdb.queryMergedFeed(sources, rawPage, pp, cacheKey, ignoredIds),
        page,
        perPage,
      );
      res.json(result);
    } catch (err) {
      res.status(502).json({ error: (err as Error).message });
    }
  });

  // Everything from favorited StashDB performers that isn't already in Stash or
  // Whisparr — no date window (unlike Watched), since the point is catching up
  // on a backlog, not just what's new this month.
  router.get("/favorites-feed", async (req, res) => {
    try {
      const q = req.query as Record<string, unknown>;
      const page = q.page ? Number(q.page) : 1;
      const perPage = q.per_page ? Number(q.per_page) : 25;

      const globalExcludes = await getGlobalExcludeIds();
      const baseInput = { favorites: "PERFORMER" as const, sort: "DATE", direction: "DESC" as const };
      const fetchRawPage =
        globalExcludes.length > 0
          ? (rawPage: number, pp: number) => stashdb.queryScenesExcluding({ ...baseInput, page: rawPage, per_page: pp }, globalExcludes)
          : (rawPage: number, pp: number) => stashdb.queryScenes({ ...baseInput, page: rawPage, per_page: pp });

      const result = await fetchUnaddedPage(cfg, localStash, whisparr, fetchRawPage, page, perPage);
      res.json(result);
    } catch (err) {
      res.status(502).json({ error: (err as Error).message });
    }
  });

  return router;
}
