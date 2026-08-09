import express from "express";
import path from "node:path";
import { timingSafeEqual } from "node:crypto";
import { loadInitialConfig } from "./settingsStore.js";
import { loadAppSecret } from "./appSecret.js";
import { capMap } from "./cacheUtil.js";
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
import { statsRouter } from "./routes/stats.js";

const cfg = await loadInitialConfig();
const { secret: appSecret, generated } = await loadAppSecret();
if (generated) {
  console.log(`\nGenerated Stash Scout app secret (paste into the app when prompted):\n  ${appSecret}\n`);
}

// Clients are always constructed — whether their target is actually configured
// is checked at call time (isLocalStashConfigured/isWhisparrConfigured), so
// configuring a service later via Settings takes effect immediately with no
// restart, since every client/route holds a reference to the same mutable cfg.
const stashdb = new StashDBClient(cfg);
const localStash = new LocalStashClient(cfg);
const whisparr = new WhisparrClient(cfg);

const app = express();
app.use(express.json());

// Shared-secret gate on the API — closes "anyone who can reach the port gets
// unauthenticated read/write, including a settings PUT that can redirect
// stashdbUrl/localStashUrl/whisparrBaseUrl to exfiltrate the already-stored
// API keys." Static asset serving below stays open since the frontend needs
// to load before it can prompt for the secret.
//
// Per-IP lockout on repeated failures — the secret itself (24 random bytes)
// makes brute force impractical, but nothing was stopping unlimited guesses.
// Map is capped like every other cache here so a spoofed/rotating source IP
// can't grow it forever.
const MAX_AUTH_FAILURES = 10;
const AUTH_LOCKOUT_MS = 5 * 60_000;
const AUTH_FAILURE_MAP_MAX_ENTRIES = 1000;
const authFailures = new Map<string, { count: number; lockedUntil: number }>();

app.use("/api", (req, res, next) => {
  const ip = req.ip ?? "unknown";
  const state = authFailures.get(ip);
  if (state && state.lockedUntil > Date.now()) {
    return void res.status(429).json({ error: "Too many failed attempts — try again later" });
  }

  const provided = Buffer.from(req.header("x-app-secret") ?? "");
  const expected = Buffer.from(appSecret);
  if (provided.length === expected.length && timingSafeEqual(provided, expected)) {
    if (state) authFailures.delete(ip);
    return next();
  }

  const count = (state?.count ?? 0) + 1;
  authFailures.set(ip, { count, lockedUntil: count >= MAX_AUTH_FAILURES ? Date.now() + AUTH_LOCKOUT_MS : 0 });
  capMap(authFailures, AUTH_FAILURE_MAP_MAX_ENTRIES);
  res.status(401).json({ error: "Unauthorized" });
});

app.use("/api", scenesRouter(stashdb, cfg, localStash, whisparr));
app.use("/api", sceneStatusRouter(cfg, localStash, whisparr));
app.use("/api", whisparrRouter(cfg, whisparr));
app.use("/api", filtersRouter());
app.use("/api", ignoredScenesRouter());
app.use("/api", globalExcludeTagsRouter());
app.use("/api", settingsRouter(cfg, localStash, whisparr));
app.use("/api", statsRouter(cfg, whisparr));

// process.cwd() (project root) rather than counting ".." from this file's own
// location — that depth differs between `tsx watch server/index.ts` (runs the
// source directly, one level under root) and the compiled build
// (dist-server/server/index.js, two levels under root), and both dev and
// prod always launch with cwd = project root per package.json's scripts.
const frontendDist = path.join(process.cwd(), "frontend", "dist");
app.use(express.static(frontendDist));
app.get("*", (_req, res) => res.sendFile(path.join(frontendDist, "index.html")));

app.listen(cfg.port, "0.0.0.0", () => {
  console.log(`Stash Scout listening on http://0.0.0.0:${cfg.port}`);
});
