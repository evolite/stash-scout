import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig, isLocalStashConfigured, isWhisparrConfigured } from "./config.js";
import { StashDBClient } from "./stashdbClient.js";
import { LocalStashClient } from "./localStashClient.js";
import { WhisparrClient } from "./whisparrClient.js";
import { scenesRouter } from "./routes/scenes.js";
import { sceneStatusRouter } from "./routes/sceneStatus.js";
import { whisparrRouter } from "./routes/whisparr.js";
import { filtersRouter } from "./routes/filters.js";
import { settingsRouter } from "./routes/settings.js";

const cfg = loadConfig();

const stashdb = new StashDBClient(cfg);
const localStash = isLocalStashConfigured(cfg) ? new LocalStashClient(cfg) : undefined;
const whisparr = isWhisparrConfigured(cfg) ? new WhisparrClient(cfg) : undefined;

const app = express();
app.use(express.json());

app.use("/api", scenesRouter(stashdb));
app.use("/api", sceneStatusRouter(cfg, localStash, whisparr));
app.use("/api", whisparrRouter(whisparr));
app.use("/api", filtersRouter());
app.use("/api", settingsRouter(cfg, localStash, whisparr));

const frontendDist = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "frontend", "dist");
app.use(express.static(frontendDist));
app.get("*", (_req, res) => res.sendFile(path.join(frontendDist, "index.html")));

app.listen(cfg.port, "0.0.0.0", () => {
  console.log(`stashdb-browser listening on http://0.0.0.0:${cfg.port}`);
});
