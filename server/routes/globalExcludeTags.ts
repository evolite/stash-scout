import { Router } from "express";
import { readJson, writeJson } from "../store.js";

export interface GlobalExcludeTag {
  id: string;
  name: string;
  addedAt: string;
}

const FILE = "global-exclude-tags.json";

export function globalExcludeTagsRouter() {
  const router = Router();

  router.get("/global-exclude-tags", async (_req, res) => {
    res.json(await readJson<GlobalExcludeTag[]>(FILE, []));
  });

  router.post("/global-exclude-tags", async (req, res) => {
    const tags = await readJson<GlobalExcludeTag[]>(FILE, []);
    const id = String(req.body.id);
    const name = String(req.body.name ?? id);
    if (!tags.some((t) => t.id === id)) {
      tags.push({ id, name, addedAt: new Date().toISOString() });
      await writeJson(FILE, tags);
    }
    res.status(201).json(tags);
  });

  router.delete("/global-exclude-tags/:id", async (req, res) => {
    const tags = await readJson<GlobalExcludeTag[]>(FILE, []);
    await writeJson(FILE, tags.filter((t) => t.id !== req.params.id));
    res.status(204).end();
  });

  return router;
}
