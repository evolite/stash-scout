# Stash Scout

A web app for browsing [StashDB](https://stashdb.org) with actual filtering, and for tracking what's new so you don't have to re-check saved searches by hand. Ties into [Stash](https://github.com/stashapp/stash) and [Whisparr](https://wiki.servarr.com/whisparr) so you can see what you already have and grab what you don't, right from the scene cards.

## What it does

- **Feed** — two grids in one tab:
  - **New Releases**: scenes matched by your saved filters (once you mark them "watched") plus your favorited StashDB performers, windowed by Week/Month/Year. Filter chips narrow it down to a single source. Each card shows which filter matched and gets an Add / Skip action — Skip is permanent.
  - **Trending**: what's trending on StashDB, with chips for New, Favorited performers, Under 30 min, and Not in library (combinable). Cards badge whether a scene is New, Monitored, already In Library, or previously Removed.
- **Filters** — search StashDB with real filters: multiple tags (AND/OR), exclude tags, performers, studios, date, sort. Save any combo, reload it later, mark it "watched" to feed it into New Releases.
- **Stats** — counts (monitored, downloading, previously added, ignored, saved/watched filters) and a timeline of what's come in.
- **Settings** — StashDB/Stash/Whisparr connections, global exclude tags (skip a tag everywhere instead of adding it to every filter), SFW mode.
- Scene cards show Play (if it's in Stash), Add to Whisparr, Monitored, Downloading, etc. — same button states/colors as the [StashSeer](https://codeberg.org/surging9143/StashSeer) userscript this grew out of.

## Running it

### Docker (easiest)

```
docker run -d -p 8787:8787 -v stash-scout-data:/app/data ghcr.io/evolite/stash-scout:latest
```

Then open `http://localhost:8787`. First load prompts for an app secret — check `docker logs` for the line printed on first boot (or set `APP_SECRET` yourself, see `.env.example`). Every `/api` request needs it, so exposing the port isn't the same as exposing your StashDB/Stash/Whisparr keys. Configure everything else (StashDB API key, Stash, Whisparr) from the **Settings** tab — no env vars or config files to hand-edit. Secrets are encrypted at rest.

### From source

```
npm install
npm run build
npm start
```

Only `PORT` is an env var (`.env`, defaults to 8787) — everything else is configured through the app.

## Stack

Plain TypeScript + Vite on the frontend (no framework), a small Express backend, SQLite (Node's built-in `node:sqlite`) for saved filters/settings/ignored scenes. Styled to look like StashDB's own dark theme. Built this way on purpose: it's a personal tool, not a product.

## Releasing

Push a `v*.*.*` tag and GitHub Actions builds + pushes the image to GHCR:

```
git tag v0.1.0
git push origin v0.1.0
```
