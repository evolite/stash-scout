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

const cfg = await loadInitialConfig();

// Clients are always constructed — whether their target is actually configured
// is checked at call time (isLocalStashConfigured/isWhisparrConfigured), so
// configuring a service later via Settings takes effect immediately with no
// restart, since every client/route holds a reference to the same mutable cfg.
const stashdb = new StashDBClient(cfg);
const localStash = new LocalStashClient(cfg);
const whisparr = new WhisparrClient(cfg);

const app = express();
app.disable("x-powered-by");
app.use((_req, res, next) => {
  res.set({ "X-Content-Type-Options": "nosniff", "X-Frame-Options": "DENY", "Referrer-Policy": "same-origin" });
  next();
});
// One reverse-proxy hop (Cloudflare tunnel, Traefik, ...) so req.secure/protocol
// follow X-Forwarded-Proto — needed for Secure cookies and the OIDC redirect URI.
app.set("trust proxy", 1);
// 5mb, not the 100kb default: a saved performer search's body carries the
// fetched result page (dozens of performers, each with an images array), which
// overflows the default limit and 413s — that's what made "save" fail
// intermittently depending on result size.
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

// Liveness/readiness probe for container orchestration — deliberately doesn't
// touch StashDB/Stash/Whisparr (those are external and expected to flap); it
// only needs to prove this process is alive and still serving requests.
const { version } = JSON.parse(readFileSync(path.join(process.cwd(), "package.json"), "utf8")) as { version: string };
app.get("/healthz", (_req, res) => res.status(200).json({ status: "ok", version }));
app.use("/api", versionRouter(version));

// process.cwd() (project root) rather than counting ".." from this file's own
// location — that depth differs between `tsx watch server/index.ts` (runs the
// source directly, one level under root) and the compiled build
// (dist-server/server/index.js, two levels under root), and both dev and
// prod always launch with cwd = project root per package.json's scripts.
const frontendDist = path.join(process.cwd(), "frontend", "dist");
app.use(
  express.static(frontendDist, {
    index: false, // index.html always goes through the catch-all below
    setHeaders: (res, filePath) => {
      // Vite content-hashes everything under assets/, so it's safe to cache forever.
      if (filePath.includes(`${path.sep}assets${path.sep}`)) {
        res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      }
    },
  }),
);
// Rate-limited because the catch-all hits the filesystem (sendFile) on every
// request. Generous ceiling — it only stops abuse, not normal SPA navigation.
const pageLimiter = rateLimit({ windowMs: 60_000, limit: 300 });
app.get("/{*splat}", pageLimiter, (_req, res) =>
  res.set("Cache-Control", "no-cache").sendFile(path.join(frontendDist, "index.html")),
);

const server = app.listen(cfg.port, "0.0.0.0", () => {
  console.log(`Stash Scout ${version} listening on http://0.0.0.0:${cfg.port}`);
  if (cfg.authMode === "off") console.warn("Authentication is off: anyone who can reach this port has full access. Enable it in Settings > Authentication.");
});

// docker stop / a Compose or K8s redeploy sends SIGTERM and waits a grace
// period before SIGKILL — without this, in-flight requests get cut off mid-
// response instead of finishing. server.close() stops accepting new
// connections and waits out ones already in progress before db.close().
function shutdown(signal: string): void {
  console.log(`${signal} received, shutting down`);
  // ponytail: don't let a hung connection run into Docker's SIGKILL grace period
  setTimeout(() => process.exit(1), 8000).unref();
  server.close(() => {
    db.close();
    process.exit(0);
  });
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

// Async routes already try/catch and respond with an error status (see every
// routes/*.ts file) — these two are a backstop for the case that slips
// through. Log then exit, not just log: Node's own guidance is that
// continuing after an uncaught exception leaves the process in an undefined
// state (here, e.g., an EADDRINUSE on listen() would otherwise be swallowed
// silently, leaving a process alive but not actually serving anything) —
// exiting lets the container's restart policy bring up a clean process.
process.on("uncaughtException", (err) => {
  console.error("uncaughtException:", err);
  process.exit(1);
});
process.on("unhandledRejection", (err) => {
  console.error("unhandledRejection:", err);
  process.exit(1);
});
