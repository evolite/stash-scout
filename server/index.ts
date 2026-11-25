import express from "express";
import rateLimit from "express-rate-limit";
import path from "node:path";
import { readFileSync } from "node:fs";
import { loadInitialConfig } from "./settingsStore.js";
import { db } from "./db.js";
import { StashDBClient } from "./stashdbClient.js";
import { LocalStashClient } from "./localStashClient.js";
import { WhisparrClient } from "./whisparrClient.js";
import { scenesRouter } from "./routes/scenes.js";
import { sceneStatusRouter } from "./routes/sceneStatus.js";
import { whisparrRouter } from "./routes/whisparr.js";
import { filtersRouter } from "./routes/filters.js";
import { performerSearchesRouter } from "./routes/performerSearches.js";
import { ignoredScenesRouter } from "./routes/ignoredScenes.js";
import { globalExcludeTagsRouter } from "./routes/globalExcludeTags.js";
import { settingsRouter } from "./routes/settings.js";
import { statsRouter } from "./routes/stats.js";
import { versionRouter } from "./routes/version.js";
import { authRouter } from "./routes/auth.js";
import { requireAuth } from "./auth.js";
import { startAutoAdd } from "./autoAdd.js";
import { healthRouter } from "./health.js";

const cfg = await loadInitialConfig();

const stashdb = new StashDBClient(cfg);
const localStash = new LocalStashClient(cfg);
const whisparr = new WhisparrClient(cfg);

const app = express();
app.disable("x-powered-by");
app.use((_req, res, next) => {
  res.set({ "X-Content-Type-Options": "nosniff", "X-Frame-Options": "DENY", "Referrer-Policy": "same-origin" });
  next();
});
app.set("trust proxy", 1);
app.use(express.json({ limit: "5mb" }));

app.use("/api", authRouter(cfg));
app.use("/api", requireAuth(cfg));
app.use("/api", scenesRouter(stashdb, cfg, localStash, whisparr));
app.use("/api", sceneStatusRouter(cfg, localStash, whisparr));
app.use("/api", whisparrRouter(cfg, whisparr));
app.use("/api", filtersRouter());
app.use("/api", performerSearchesRouter());
app.use("/api", ignoredScenesRouter());
app.use("/api", globalExcludeTagsRouter());
app.use("/api", settingsRouter(cfg, localStash, whisparr));
app.use("/api", statsRouter(cfg, whisparr));

const { version } = JSON.parse(readFileSync(path.join(process.cwd(), "package.json"), "utf8")) as { version: string };
app.use(healthRouter(version, db, cfg, localStash));
app.use("/api", versionRouter(version));

const frontendDist = path.join(process.cwd(), "frontend", "dist");
app.use(
  express.static(frontendDist, {
    index: false,
    setHeaders: (res, filePath) => {
      if (filePath.includes(`${path.sep}assets${path.sep}`)) {
        res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      }
    },
  }),
);
const pageLimiter = rateLimit({ windowMs: 60_000, limit: 300 });
app.get("/{*splat}", pageLimiter, (_req, res) =>
  res.set("Cache-Control", "no-cache").sendFile(path.join(frontendDist, "index.html")),
);

const server = app.listen(cfg.port, "0.0.0.0", () => {
  console.log(`Stash Scout ${version} listening on http://0.0.0.0:${cfg.port}`);
  if (cfg.authMode === "off") console.warn("Authentication is off: anyone who can reach this port has full access. Enable it in Settings > Authentication.");
});
startAutoAdd(cfg, { stashdb, localStash, whisparr });

function shutdown(signal: string): void {
  console.log(`${signal} received, shutting down`);
  setTimeout(() => process.exit(1), 8000).unref();
  server.close(() => {
    db.close();
    process.exit(0);
  });
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

process.on("uncaughtException", (err) => {
  console.error("uncaughtException:", err);
  process.exit(1);
});
process.on("unhandledRejection", (err) => {
  console.error("unhandledRejection:", err);
  process.exit(1);
});
