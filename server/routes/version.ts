import { Router } from "express";
import { readFile } from "node:fs/promises";
import path from "node:path";

const REPO = "evolite/stash-scout";
const TAGS_URL = `https://api.github.com/repos/${REPO}/tags?per_page=30`;
const RELEASES_URL = `https://github.com/${REPO}/releases`;
const CHECK_TTL_MS = 6 * 60 * 60_000;
const RETRY_TTL_MS = 10 * 60_000; // after a failed lookup, don't hammer GitHub
const MIN_REFRESH_MS = 60_000; // "Check now" can't bypass the cache more than once a minute
const FETCH_TIMEOUT_MS = 8_000;

const parts = (v: string) => v.replace(/^v/, "").split(".").map((n) => Number.parseInt(n, 10) || 0);

// >0 when a is newer than b (numeric per segment, so 0.10.0 > 0.9.0).
export function compareVersions(a: string, b: string): number {
  const pa = parts(a);
  const pb = parts(b);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d) return d;
  }
  return 0;
}

async function fetchLatestVersion(): Promise<string | null> {
  const res = await fetch(TAGS_URL, {
    headers: { Accept: "application/vnd.github+json", "User-Agent": "stash-scout-update-check" },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`GitHub tags: HTTP ${res.status}`);
  const tags = ((await res.json()) as { name: string }[]).map((t) => t.name).filter((n) => /^v\d+\.\d+\.\d+$/.test(n));
  return tags.sort((x, y) => compareVersions(y, x))[0]?.replace(/^v/, "") ?? null;
}

// Version comes from package.json (injected); the changelog is CHANGELOG.md in
// the project root, generated at release time by git-cliff and baked into the
// image — so release notes never need a network call, only "is there a newer
// version" does. Set DISABLE_UPDATE_CHECK=1 to skip that lookup entirely.
export function versionRouter(current: string) {
  const router = Router();
  const checkEnabled = process.env.DISABLE_UPDATE_CHECK !== "1";
  let latest: string | null = null;
  let checkedAt: number | null = null;
  let nextCheckAt = 0;
  let lastError: string | undefined;

  async function refresh(force: boolean) {
    const now = Date.now();
    if (!checkEnabled || now < nextCheckAt) return;
    if (force && checkedAt !== null && now - checkedAt < MIN_REFRESH_MS) return;
    try {
      latest = await fetchLatestVersion();
      checkedAt = now;
      lastError = undefined;
      nextCheckAt = now + CHECK_TTL_MS;
    } catch (err) {
      lastError = (err as Error).message;
      nextCheckAt = now + RETRY_TTL_MS;
    }
  }

  router.get("/version", async (req, res) => {
    await refresh(req.query.refresh === "1");
    res.json({
      current,
      latest,
      updateAvailable: latest !== null && compareVersions(latest, current) > 0,
      url: RELEASES_URL,
      checkEnabled,
      checkedAt,
      error: lastError,
    });
  });

  router.get("/changelog", async (_req, res) => {
    try {
      res.json({ markdown: await readFile(path.join(process.cwd(), "CHANGELOG.md"), "utf8") });
    } catch {
      res.json({ markdown: "" });
    }
  });

  return router;
}
