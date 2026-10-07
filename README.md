# Stash Scout

A weekend project for people who use [StashDB](https://stashdb.org) for discovery: browse it with enhanced filtering, subscribe to your custom filters, and see at a glance what you already own, and ignore content you don't plan to get so you always have a streamlined and easily browsable list. Plugs into [Stash](https://github.com/stashapp/stash) and [Whisparr](https://wiki.servarr.com/whisparr) so you can grab what's missing without leaving the page.

Grew out of the [StashSeer](https://codeberg.org/surging9143/StashSeer) userscript.

## What you get

- **Feed** — new releases from your watched filters and favorite performers, plus what's trending on StashDB.
- **Filters** — tag AND/OR, excludes, performers, studios, dates. Save combos and reuse them.
- **Stats** — a quick look at what's monitored, downloading and ignored.
- **Scene cards** — Play, Add, Monitored, In Library, all at a glance.

## Run it

```
docker run -d --restart unless-stopped -p 8787:8787 \
  -v stash-scout-data:/app/data ghcr.io/evolite/stash-scout:latest
```

Open `http://localhost:8787` and hook up StashDB, Stash and Whisparr under **Settings**. No config files to edit.

Prefer source?

```
npm install && npm run build && npm start
```

## Under the hood

TypeScript, Vite and Tailwind on the front, a small Express server, SQLite for storage.
