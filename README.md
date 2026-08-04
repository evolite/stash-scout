# stashdb-browser

A little web app for browsing [StashDB](https://stashdb.org) with actual filtering, because the site's own filters are pretty thin (one tag at a time, no excludes, no saved searches). Also ties into [Stash](https://github.com/stashapp/stash) and [Whisparr](https://wiki.servarr.com/whisparr) so you can see what you already have and grab what you don't, right from the scene cards — like the [StashSeer](https://codeberg.org/surging9143/StashSeer) userscript, but as its own app instead of something bolted onto stashdb.org.

## What it does

- **Browse** — search StashDB with real filters: multiple tags (AND/OR), exclude tags, performers, studios, date, sort. Only fetches when you hit Apply, not on every keystroke.
- **Saved filters** — save any filter combo, reload it later, tweak and overwrite it.
- **Watched** — check a saved filter to "watch" it, and its recent (last 30 days) results show up in one combined feed. Multiple watched filters are round-robinned so one popular filter doesn't drown out the others. Skips anything you already have.
- **Favorites** — everything from your favorited StashDB performers that you don't have yet, no date limit (it's a backlog, not a "what's new" feed).
- **Global exclude tags** — exclude a tag (looking at you, "Virtual Reality") once in Settings instead of adding it to every filter.
- **Ignore** — hide a scene from Watched/Favorites for good.
- Scene cards show Play (if it's in Stash), Add to Whisparr, Monitored, Downloading, etc. — same button states/colors as StashSeer.

## Running it

### Docker (easiest)

```
docker run -d -p 8787:8787 -v stashdb-browser-data:/app/data ghcr.io/evolite/stashdb-browser:latest
```

Then open `http://localhost:8787` and configure everything (StashDB API key, Stash, Whisparr) from the **Settings** tab — no env vars or config files to hand-edit. Secrets are encrypted at rest in the `data` volume.

### From source

```
npm install
npm run build
npm start
```

Only `PORT` is an env var (`.env`, defaults to 8787) — everything else is configured through the app.

## Stack

Plain TypeScript + Vite on the frontend (no framework), a small Express backend, no database — just JSON files in `data/`. Styled to look like StashDB's own dark theme. Built this way on purpose: it's a personal tool, not a product.

## Releasing

Push a `v*.*.*` tag and GitHub Actions builds + pushes the image to GHCR:

```
git tag v0.1.0
git push origin v0.1.0
```
