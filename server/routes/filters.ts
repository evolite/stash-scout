import { Router } from "express";
import { randomUUID } from "node:crypto";
import { readJson, writeJson } from "../store.js";

export interface SavedFilter {
  id: string;
  name: string;
  createdAt: string;
  filter: Record<string, unknown>;
  watched: boolean;
}

const FILE = "filters.json";

export function filtersRouter() {
  const router = Router();

  router.get("/filters", async (_req, res) => {
    res.json(await readJson<SavedFilter[]>(FILE, []));
  });

  router.post("/filters", async (req, res) => {
    const filters = await readJson<SavedFilter[]>(FILE, []);
    const entry: SavedFilter = {
      id: randomUUID(),
      name: String(req.body.name ?? "Untitled"),
      createdAt: new Date().toISOString(),
      filter: req.body.filter ?? {},
      watched: false,
    };
    filters.push(entry);
    await writeJson(FILE, filters);
    res.status(201).json(entry);
  });

  router.patch("/filters/:id", async (req, res) => {
    const filters = await readJson<SavedFilter[]>(FILE, []);
    const entry = filters.find((f) => f.id === req.params.id);
    if (!entry) return void res.status(404).end();
    if (typeof req.body.watched === "boolean") entry.watched = req.body.watched;
    await writeJson(FILE, filters);
    res.json(entry);
  });

  router.delete("/filters/:id", async (req, res) => {
    const filters = await readJson<SavedFilter[]>(FILE, []);
    await writeJson(FILE, filters.filter((f) => f.id !== req.params.id));
    res.status(204).end();
  });

  return router;
}
