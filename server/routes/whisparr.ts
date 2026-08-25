import { Router } from "express";
import type { AppConfig } from "../config.js";
import { isWhisparrConfigured } from "../config.js";
import { recordWhisparrError, withRetry, type WhisparrClient } from "../whisparrClient.js";

export function whisparrRouter(cfg: AppConfig, whisparr: WhisparrClient) {
  const router = Router();

  // Async request-reply: respond immediately so the frontend isn't blocked on
  // Whisparr's (possibly slow) response, then mutate + retry in the
  // background. Failures land in whisparrClient's error map and surface via
  // the next /api/scenes/status poll instead of this response.
  router.post("/whisparr/scenes/:stashId", (req, res) => {
    if (!isWhisparrConfigured(cfg)) return void res.status(400).json({ error: "Whisparr not configured" });
    const stashId = req.params.stashId;
    res.status(202).json({ accepted: true });
    withRetry(() => whisparr.addScene(stashId)).catch((err) => recordWhisparrError(stashId, (err as Error).message));
  });

  router.post("/whisparr/scenes/:movieId/monitor", (req, res) => {
    if (!isWhisparrConfigured(cfg)) return void res.status(400).json({ error: "Whisparr not configured" });
    const movieId = Number(req.params.movieId);
    const monitored = !!req.body.monitored;
    res.status(202).json({ accepted: true });
    withRetry(() => whisparr.setMonitored(movieId, monitored)).catch((err) =>
      recordWhisparrError(String(movieId), (err as Error).message),
    );
  });

  router.get("/whisparr/options", async (_req, res) => {
    if (!isWhisparrConfigured(cfg)) return void res.status(400).json({ error: "Whisparr not configured" });
    try {
      const [rootFolders, qualityProfiles] = await Promise.all([
        whisparr.getRootFolders(),
        whisparr.getQualityProfiles(),
      ]);
      res.json({ rootFolders, qualityProfiles });
    } catch (err) {
      res.status(502).json({ error: (err as Error).message });
    }
  });

  return router;
}
