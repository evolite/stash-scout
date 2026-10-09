# Stash Scout

A project for personal use as i often find myself browsing StashDB for content 

My issue was that StashDB does not natively support excluding tags, or further filtering down searches beyond one tag. I also found myself constantly looking up the same tags etc, So this is an attempt to improve my own experience. It is Vibe coded, and i want to be upfront about that. 

The idea is that i wanted a place where i could create searches, and save them, and or subscribe to them so i get a feed of what’s new within my “interests”. I can add them to stash through whisparr if i want, and i can ignore the scene if i see it’s not for me. Keeping my dash clean.

I also wanted to be able to filter away tags like VR and things that don’t match my sexual preference etc and do that globally.

Should also be respectful of the StashDB API limits :)

Also have a small plugin which integrates some parts with Stash (Links to stash-scout form performer / studio) (“Scout-Plugin” from my index. https://codeberg.org/surging9143/pages/src/branch/main/index.yml)

Grew out of the StashSeer userscript.

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

## Run it

```
docker run -d --restart unless-stopped -p 8787:8787 \
  -v stash-scout-data:/app/data ghcr.io/evolite/stash-scout:latest
```

Open `http://localhost:8787` and hook up StashDB, Stash and Whisparr under **Settings**. No config files to edit.

## Login (optional)

Off by default. In Settings > Authentication pick **Username & password** or **OIDC (SSO)**. For OIDC, register `<your-url>/api/auth/oidc/callback` as the redirect URI and set "Allowed email / sub" to restrict who can sign in. Locked out? Start once with `AUTH_MODE_FORCE=off`.

## Under the hood

TypeScript, Vite and Tailwind on the front, a small Express server, SQLite for storage.

## Disclaimer

Code is AI-Generated, quality gated with Sonarqube and GHQL
