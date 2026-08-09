import { Router } from "express";
import type { AppConfig } from "../config.js";
import type { LocalStashClient } from "../localStashClient.js";
import type { WhisparrClient } from "../whisparrClient.js";
import { getSceneStatus } from "../stateMachine.js";

// A grid page is at most MAX_PER_PAGE (40) scenes — well under this; the cap
// exists so an arbitrarily long `ids` query string can't fan out unbounded
// concurrent local Stash/Whisparr requests.
const MAX_STATUS_IDS = 100;

export function sceneStatusRouter(cfg: AppConfig, localStash: LocalStashClient, whisparr: WhisparrClient) {
  const router = Router();

  // Batched status lookup for a whole grid page: /api/scenes/status?ids=a,b,c
  router.get("/scenes/status", async (req, res) => {
    const ids = String(req.query.ids ?? "").split(",").filter(Boolean).slice(0, MAX_STATUS_IDS);
    const entries = await Promise.all(
      ids.map(async (id) => [id, await getSceneStatus(cfg, id, { localStash, whisparr })] as const),
    );
    res.json(Object.fromEntries(entries));
  });

  return router;
}
