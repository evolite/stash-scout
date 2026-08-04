import { Router } from "express";
import { readJson, writeJson } from "../store.js";

export interface IgnoredScene {
  id: string;
  ignoredAt: string;
}

const FILE = "ignored-scenes.json";

export function ignoredScenesRouter() {
  const router = Router();

  router.post("/ignored-scenes", async (req, res) => {
    const ignored = await readJson<IgnoredScene[]>(FILE, []);
    const id = String(req.body.id);
    if (!ignored.some((s) => s.id === id)) {
      ignored.push({ id, ignoredAt: new Date().toISOString() });
      await writeJson(FILE, ignored);
    }
    res.status(204).end();
  });

  return router;
}
