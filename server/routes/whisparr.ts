import { Router } from "express";
import type { WhisparrClient } from "../whisparrClient.js";

export function whisparrRouter(whisparr?: WhisparrClient) {
  const router = Router();

  router.post("/whisparr/scenes/:stashId", async (req, res) => {
    if (!whisparr) return void res.status(400).json({ error: "Whisparr not configured" });
    try {
      res.json(await whisparr.addScene(req.params.stashId));
    } catch (err) {
      res.status(502).json({ error: (err as Error).message });
    }
  });

  router.post("/whisparr/scenes/:movieId/monitor", async (req, res) => {
    if (!whisparr) return void res.status(400).json({ error: "Whisparr not configured" });
    try {
      res.json(await whisparr.setMonitored(Number(req.params.movieId), !!req.body.monitored));
    } catch (err) {
      res.status(502).json({ error: (err as Error).message });
    }
  });

  router.get("/whisparr/options", async (_req, res) => {
    if (!whisparr) return void res.status(400).json({ error: "Whisparr not configured" });
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
