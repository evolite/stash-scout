import { Router } from "express";
import type { AppConfig } from "../config.js";
import type { LocalStashClient } from "../localStashClient.js";
import type { WhisparrClient } from "../whisparrClient.js";
import { getSceneStatus } from "../stateMachine.js";

export function sceneStatusRouter(cfg: AppConfig, localStash?: LocalStashClient, whisparr?: WhisparrClient) {
  const router = Router();

  // Batched status lookup for a whole grid page: /api/scenes/status?ids=a,b,c
  router.get("/scenes/status", async (req, res) => {
    const ids = String(req.query.ids ?? "").split(",").filter(Boolean);
    const entries = await Promise.all(
      ids.map(async (id) => [id, await getSceneStatus(cfg, id, { localStash, whisparr })] as const),
    );
    res.json(Object.fromEntries(entries));
  });

  return router;
}
