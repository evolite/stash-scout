import { Router } from "express";
import type { StashDBClient } from "../stashdbClient.js";
import type { AppConfig } from "../config.js";
import type { LocalStashClient } from "../localStashClient.js";
import type { WhisparrClient } from "../whisparrClient.js";
import type { Scene } from "../../shared/types.js";
import { getWatchedFeed, WATCHED_WINDOW_DAYS } from "../watchedFeed.js";

// Radarr-family "RSS List" import lists (which Whisparr's Lists screen also
// exposes) search their own metadata provider by the item's <title> text —
// there's no field for handing over an exact StashDB id, confirmed against
// Radarr's own documented RSS list format (github.com/Radarr/Radarr#2358)
// and Whisparr's own title-text-search matching behavior (Whisparr#960). So
// <title>/<guid> carry the plain scene title verbatim (best chance of an
// exact match), and <link>/<description> are just for a human reading the
// feed directly — Whisparr itself won't use them.
const MAX_ITEMS = 100;

function escapeXml(s: string): string {
  return s.replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[c]!);
}

function sceneItem(scene: Scene): string {
  const title = scene.title ?? "(untitled)";
  const link = `https://stashdb.org/scenes/${scene.id}`;
  const studio = scene.studio?.name;
  const description = studio ? `${studio}${scene.release_date ? ` — ${scene.release_date}` : ""}` : (scene.release_date ?? "");
  const pubDate = scene.release_date ? new Date(`${scene.release_date}T00:00:00Z`).toUTCString() : undefined;
  return [
    "<item>",
    `<title>${escapeXml(title)}</title>`,
    `<link>${escapeXml(link)}</link>`,
    `<guid isPermaLink="false">${escapeXml(title)}</guid>`,
    description ? `<description>${escapeXml(description)}</description>` : "",
    pubDate ? `<pubDate>${pubDate}</pubDate>` : "",
    "</item>",
  ]
    .filter(Boolean)
    .join("");
}

function buildRss(title: string, description: string, scenes: Scene[]): string {
  return (
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<rss version="2.0"><channel>` +
    `<title>${escapeXml(title)}</title>` +
    `<link>https://stashdb.org</link>` +
    `<description>${escapeXml(description)}</description>` +
    scenes.map(sceneItem).join("") +
    `</channel></rss>`
  );
}

export function feedRouter(stashdb: StashDBClient, cfg: AppConfig, localStash: LocalStashClient, whisparr: WhisparrClient) {
  const router = Router();

  // Meant to be pasted straight into Whisparr's Lists screen as an "RSS List"
  // — same merged watched-filters + Favorites source as the Feed tab's
  // Watched section, just rendered as RSS instead of JSON and fetched as one
  // large page instead of paginated (RSS consumers poll the whole feed).
  router.get("/feed/watched.rss", async (req, res) => {
    try {
      const window = String(req.query.window ?? "week");
      if (!(window in WATCHED_WINDOW_DAYS)) {
        res.status(400).json({ error: `window must be one of: ${Object.keys(WATCHED_WINDOW_DAYS).join(", ")}` });
        return;
      }
      const { scenes } = await getWatchedFeed({ stashdb, cfg, localStash, whisparr }, { window, page: 1, perPage: MAX_ITEMS });
      const xml = buildRss(
        `stashdb-browser — Watched (${window})`,
        "Scenes from your watched saved filters and favorited performers, not yet in Stash or Whisparr.",
        scenes,
      );
      res.set("Content-Type", "application/rss+xml; charset=utf-8").send(xml);
    } catch (err) {
      res.status(502).json({ error: (err as Error).message });
    }
  });

  return router;
}
