import { api, type Scene, type SceneStatus } from "../api.js";
import { iconPlay, iconPlus, iconMinus } from "../icons.js";
import { navigateToPerformer } from "../navigation.js";
import { isGenderShown } from "../genderPrefs.js";

function isWithinLastWeek(releaseDate: string | null): boolean {
  if (!releaseDate) return false;
  const days = (Date.now() - new Date(releaseDate).getTime()) / (24 * 60 * 60 * 1000);
  return days >= 0 && days <= 7;
}

function formatDuration(seconds: number | null): string {
  if (!seconds) return "";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const mm = String(m).padStart(h ? 2 : 1, "0");
  const ss = String(s).padStart(2, "0");
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

// A few close, flat dark neutrals — picked per scene id (not random) so a given
// card's placeholder color is stable across re-renders, purely for variety
// when there's no thumbnail image. No gradients.
const PLACEHOLDER_SHADES = ["#2A2D33", "#26292E", "#2E3138"];
function placeholderShade(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = Math.trunc(hash * 31 + id.codePointAt(i)!);
  return PLACEHOLDER_SHADES[Math.abs(hash) % PLACEHOLDER_SHADES.length];
}

function badgeFor(s: Scene, status: SceneStatus | undefined): { text: string; className: string } | undefined {
  switch (status?.kind) {
    case "in-stash":
      return { text: "In Library", className: "badge-in-library" };
    case "monitored":
    case "downloading":
    case "pending": // optimistic Add — assume it lands as Monitored
      return { text: "Monitored", className: "badge-monitored" };
    case "previously-added":
      return { text: "Removed", className: "badge-removed" };
    case "error":
      return { text: "Failed", className: "bg-danger/20 text-danger border border-danger" };
  }
  // Neutral dark chip: this badge means "matched saved filter", not library
  // status, so it only shows up when there's no more specific status above.
  if (s.sourceLabel) return { text: s.sourceLabel, className: "bg-black/75 text-text border border-white/[.12] font-semibold" };
  if (status?.kind === "not-added" && isWithinLastWeek(s.release_date)) return { text: "New", className: "badge-new" };
  return undefined;
}

// One shared floating preview (not one per card) — only ever one hover at a
// time, and appending to <body> lets it escape the grid's overflow/stacking
// instead of getting clipped by each card. Large and centered — a proper
// look at the image, not a small thumbnail-sized peek — with a dimmed
// backdrop so it reads clearly over whatever grid is behind it.
const PREVIEW_DELAY_MS = 1000;
let previewEl: HTMLDivElement | null = null;
let previewTimer: ReturnType<typeof setTimeout> | undefined;

// Exported so callers can clear a stray floating preview before an action
// tears down the card that's showing it — the mouse never leaves in that case
// (the node is just removed/replaced from under the cursor), so mouseleave
// never fires and the preview would otherwise stay stuck on screen until the
// next unrelated hover or scroll.
export function hidePreview(): void {
  clearTimeout(previewTimer);
  previewEl?.remove();
  previewEl = null;
  window.removeEventListener("scroll", hidePreview, true);
}

function showPreview(url: string): void {
  const el = document.createElement("div");
  el.className = "fixed inset-0 z-50 flex items-center justify-center pointer-events-none bg-black/60";
  const img = document.createElement("img");
  img.src = url;
  img.className = "block rounded shadow-card object-contain";
  img.style.maxWidth = "90vw";
  img.style.maxHeight = "90vh";
  el.appendChild(img);
  document.body.appendChild(el);
  previewEl = el;

  window.addEventListener("scroll", hidePreview, true);
}

// excludeEl (the hover-actions button row, when present) sits inside
// imageWrap, so moving onto it doesn't fire imageWrap's own mouseleave —
// without this, hovering the Add/Skip buttons still counted as hovering the
// image and the preview would pop up (or stay showing) right over them.
function attachHoverPreview(imageWrap: HTMLElement, url: string, excludeEl?: HTMLElement): void {
  function arm() {
    clearTimeout(previewTimer);
    previewTimer = setTimeout(() => showPreview(url), PREVIEW_DELAY_MS);
  }
  imageWrap.addEventListener("mouseenter", arm);
  imageWrap.addEventListener("mouseleave", hidePreview);
  if (excludeEl) {
    excludeEl.addEventListener("mouseenter", () => {
      clearTimeout(previewTimer);
      hidePreview();
    });
    excludeEl.addEventListener("mouseleave", arm);
  }
}

// Disables the button and spins its icon for the duration of onClick — the
// button (and its spinner) normally gets torn down almost immediately anyway
// once onStatusChange/onRemove re-renders the card, but this is what's
// actually visible while an Add/Monitor click is in flight instead of nothing.
function hoverButton(title: string, icon: SVGSVGElement, variant: "add" | "skip" | undefined, onClick: () => void | Promise<void>): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.title = title;
  if (variant) btn.classList.add(`action-${variant}`);
  btn.appendChild(icon);
  btn.addEventListener("click", async (e) => {
    e.preventDefault();
    e.stopPropagation();
    hidePreview();
    btn.disabled = true;
    icon.classList.add("animate-spin");
    await onClick();
  });
  return btn;
}

// The single place scene actions live — a compact icon row that only appears
// on hover, same for every section (Trending, New Releases): Play if it's
// already in the local Stash, otherwise a +/- pair for whatever the current
// status allows. Skip (-) permanently ignores the scene (api.ignoreScene) and
// removes the card via onRemove; already-monitored scenes only get a - to
// unmonitor, since the Monitored badge already communicates their state.
function renderHoverActions(s: Scene, status: SceneStatus | undefined, onStatusChange: (optimistic?: SceneStatus) => void, onRemove: () => void): HTMLElement | undefined {
  if (!status) return undefined;
  // No buttons while a mutation is in flight (pending) or just failed
  // (error) — the next status poll settles this within a couple seconds.
  if (status.kind === "pending" || status.kind === "error") return undefined;
  const buttons: HTMLButtonElement[] = [];

  if (status.kind === "in-stash") {
    buttons.push(
      hoverButton("Play in local Stash", iconPlay(), undefined, () => {
        window.open(status.localUrl, "_blank", "noopener");
      }),
    );
  } else {
    if (status.kind === "not-added" && status.whisparrConfigured) {
      buttons.push(
        hoverButton("Add Scene", iconPlus(), "add", () => {
          onStatusChange({ kind: "pending" });
          api.addToWhisparr(s.id).catch(() => {});
        }),
      );
    } else if (status.kind === "previously-added") {
      buttons.push(
        hoverButton("Re-enable monitoring", iconPlus(), "add", () => {
          onStatusChange({ kind: "monitored", movieId: status.movieId });
          api.setMonitored(status.movieId, true).catch(() => {});
        }),
      );
    }

    if (status.kind === "monitored") {
      buttons.push(
        hoverButton("Unmonitor", iconMinus(), "skip", () => {
          onStatusChange({ kind: "previously-added", movieId: status.movieId });
          api.setMonitored(status.movieId, false).catch(() => {});
        }),
      );
    } else if (status.kind === "not-added" || status.kind === "previously-added") {
      buttons.push(
        hoverButton("Skip — permanently dismiss this scene", iconMinus(), "skip", async () => {
          await api.ignoreScene(s.id);
          onRemove();
        }),
      );
    }
  }

  if (buttons.length === 0) return undefined;
  const hover = document.createElement("div");
  hover.className = "SceneCard-hover";
  for (const b of buttons) hover.appendChild(b);
  return hover;
}

export function renderSceneCard(s: Scene, status: SceneStatus | undefined, onStatusChange: (optimistic?: SceneStatus) => void, onRemove: () => void): HTMLElement {
  const card = document.createElement("div");
  card.className = "group relative bg-surface rounded-lg shadow-card overflow-hidden flex flex-col transition-shadow duration-150 ease-out hover:shadow-[0_2px_4px_rgba(0,0,0,.4),0_8px_24px_rgba(0,0,0,.5)]";

  const badge = badgeFor(s, status);
  if (badge) {
    const el = document.createElement("span");
    el.className = `SceneCard-badge ${badge.className}`;
    el.textContent = badge.text;
    card.appendChild(el);
  }

  const imageWrap = document.createElement("a");
  imageWrap.className = "relative block aspect-video bg-navbar";
  imageWrap.href = `https://stashdb.org/scenes/${s.id}`;
  imageWrap.target = "_blank";
  const hover = renderHoverActions(s, status, onStatusChange, onRemove);
  const image = s.images[0];
  if (image) {
    const img = document.createElement("img");
    img.className = "SceneCard-image w-full h-full object-cover object-top block";
    img.src = image.url;
    img.alt = "";
    imageWrap.appendChild(img);
    attachHoverPreview(imageWrap, image.url, hover);
  } else {
    imageWrap.style.background = placeholderShade(s.id);
  }
  if (s.duration) {
    const duration = document.createElement("span");
    duration.className = "SceneCard-duration";
    duration.textContent = formatDuration(s.duration);
    imageWrap.appendChild(duration);
  }
  if (hover) imageWrap.appendChild(hover);
  card.appendChild(imageWrap);

  const footer = document.createElement("div");
  footer.className = "p-3 text-xs";

  const title = document.createElement("a");
  title.className = "SceneCard-text block font-semibold whitespace-nowrap overflow-hidden text-ellipsis hover:text-link";
  title.textContent = s.title ?? "(untitled)";
  title.href = `https://stashdb.org/scenes/${s.id}`;
  title.target = "_blank";
  footer.appendChild(title);

  const meta = document.createElement("div");
  meta.className = "text-muted flex justify-between mt-1";
  const studio = document.createElement("span");
  studio.className = "SceneCard-text overflow-hidden text-ellipsis whitespace-nowrap";
  studio.textContent = s.studio?.name ?? "";
  meta.appendChild(studio);
  const date = document.createElement("strong");
  date.textContent = s.release_date ?? "";
  meta.appendChild(date);
  footer.appendChild(meta);

  // Which genders show here is a user preference (Settings > Performers) —
  // see genderPrefs.ts.
  const shownPerformers = s.performers.filter((p) => isGenderShown(p.performer.gender));
  if (shownPerformers.length > 0) {
    const performersRow = document.createElement("div");
    performersRow.className = "text-muted mt-1 overflow-hidden text-ellipsis whitespace-nowrap";
    shownPerformers.forEach((p, i) => {
      if (i > 0) performersRow.appendChild(document.createTextNode(", "));
      // Pure in-app tab switch (see navigation.ts) — not a real link, so no
      // address-bar change and no page reload.
      const link = document.createElement("button");
      link.type = "button";
      link.className = "hover:text-link bg-transparent border-0 p-0 text-inherit cursor-pointer";
      link.textContent = p.performer.name;
      link.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        navigateToPerformer(p.performer.id);
      });
      performersRow.appendChild(link);
    });
    footer.appendChild(performersRow);
  }

  card.appendChild(footer);
  return card;
}
