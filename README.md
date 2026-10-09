# Stash Scout

A weekend project for people who use [StashDB](https://stashdb.org) for discovery: browse it with enhanced filtering, subscribe to your custom filters, and see at a glance what you already own, and ignore content you don't plan to get so you always have a streamlined and easily browsable list. Plugs into [Stash](https://github.com/stashapp/stash) and [Whisparr](https://wiki.servarr.com/whisparr) so you can grab what's missing without leaving the page.

Grew out of the [StashSeer](https://codeberg.org/surging9143/StashSeer) userscript.

## Why not just StashDB or StashSeer?

|  | StashDB | StashSeer userscript | **Stash Scout** |
|---|:-:|:-:|:-:|
| Browse and search scenes | ✅ | ✅ | ✅ |
| Library / Whisparr status on scene cards | ❌ | ✅ | ✅ |
| Add to Whisparr from the card | ❌ | ✅ | ✅ |
| Save filters and reuse them | ❌ | ❌ | ✅ |
| **Subscribe** to a filter and get a feed of what's new | ❌ | ❌ | ✅ |
| Exclude tags | ❌ | ❌ | ✅ |
| Skip scenes for good, so they stop showing up | ❌ | ❌ | ✅ |
| Trending, narrowed to what you don't own yet | ❌ | ❌ | ✅ |
| Stats | ❌ | ❌ | ✅ |

**Main Goal:** build a filter once, hit Subscribe, and new matches show up in your Feed. No more re-running the same searches by hand.

## Run it

```
docker run -d --restart unless-stopped -p 8787:8787 \
  -v stash-scout-data:/app/data ghcr.io/evolite/stash-scout:latest
```

Open `http://localhost:8787` and hook up StashDB, Stash and Whisparr under **Settings**. No config files to edit.

## Under the hood

TypeScript, Vite and Tailwind on the front, a small Express server, SQLite for storage.

## Disclaimer

Code is AI-Generated, quality gated with Sonarqube and GHQL
