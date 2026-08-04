import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadInitialConfig } from "./settingsStore.js";
import { StashDBClient } from "./stashdbClient.js";
import { LocalStashClient } from "./localStashClient.js";
import { WhisparrClient } from "./whisparrClient.js";
import { scenesRouter } from "./routes/scenes.js";
import { sceneStatusRouter } from "./routes/sceneStatus.js";
import { whisparrRouter } from "./routes/whisparr.js";
import { filtersRouter } from "./routes/filters.js";
import { ignoredScenesRouter } from "./routes/ignoredScenes.js";
import { globalExcludeTagsRouter } from "./routes/globalExcludeTags.js";
import { settingsRouter } from "./routes/settings.js";

const cfg = await loadInitialConfig();

// Clients are always constructed — whether their target is actually configured
// is checked at call time (isLocalStashConfigured/isWhisparrConfigured), so
// configuring a service later via Settings takes effect immediately with no
// restart, since every client/route holds a reference to the same mutable cfg.
const stashdb = new StashDBClient(cfg);
const localStash = new LocalStashClient(cfg);
const whisparr = new WhisparrClient(cfg);

const app = express();
app.use(express.json());

app.use("/api", scenesRouter(stashdb, cfg, localStash, whisparr));
app.use("/api", sceneStatusRouter(cfg, localStash, whisparr));
app.use("/api", whisparrRouter(cfg, whisparr));
app.use("/api", filtersRouter());
app.use("/api", ignoredScenesRouter());
app.use("/api", globalExcludeTagsRouter());
app.use("/api", settingsRouter(cfg, localStash, whisparr));

const frontendDist = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "frontend", "dist");
app.use(express.static(frontendDist));
app.get("*", (_req, res) => res.sendFile(path.join(frontendDist, "index.html")));

app.listen(cfg.port, "0.0.0.0", () => {
  console.log(`stashdb-browser listening on http://0.0.0.0:${cfg.port}`);
});
