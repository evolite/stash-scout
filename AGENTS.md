# Agent notes

## Dev instance vs. release build

The server on :8787 in this workspace is the project's **development instance**;
what ships is the Docker release build. A build-time flag keeps them apart:

- `__DEV_INSTANCE__` (defined in `frontend/vite.config.ts`, typed in
  `frontend/src/vite-env.d.ts`) is true under `vite` dev (`npm run dev:frontend`,
  :5173) or when building with `DEV_INSTANCE=1`.
- When true: a red **DEV** banner (`main.ts`), blur mode (the "SFW Mode" toggle) is
  forced on at load and on every `render()` — it can be switched off but returns on
  the next navigation — and `frontend/src/dev.css` loads, which heavily blurs all
  images and redacts text (`sfw-img` / `sfw-text` classes, `SceneCard-*`).
- **Update :8787 after frontend changes with `npm run build:dev-frontend`**
  (no server restart; it serves `frontend/dist` from disk). Plain `npm run build` /
  `build:frontend` drops the dev behavior.
- Release (`npm run build`, Dockerfile, CI) never sets the flag, so none of this is
  in the shipped bundle. Keep it that way: gate new dev-only code on
  `__DEV_INSTANCE__`, and don't use Tailwind classes for it (the scanner would ship
  the utilities in release CSS) — use inline styles or `dev.css`.
