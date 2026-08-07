import { api, type Scene, type SceneStatus } from "../api.js";
import { iconPlay, iconPlus, iconMinus } from "../icons.js";

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
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0;
  return PLACEHOLDER_SHADES[Math.abs(hash) % PLACEHOLDER_SHADES.length];
}

function badgeFor(s: Scene, status: SceneStatus | undefined): { text: string; className: string } | undefined {
  // Neutral dark chip: this badge means "matched saved filter", not library
  // status, so it's deliberately distinct from the status-derived badges below.
  if (s.sourceLabel) return { text: s.sourceLabel, className: "bg-black/75 text-text border border-white/[.12] font-semibold" };
  switch (status?.kind) {
    case "in-stash":
      return { text: "In Library", className: "badge-in-library" };
    case "not-added":
      return isWithinLastWeek(s.release_date) ? { text: "New", className: "badge-new" } : undefined;
    case "monitored":
    case "downloading":
      return { text: "Monitored", className: "badge-monitored" };
    case "previously-added":
      return { text: "Removed", className: "badge-removed" };
    default:
      return undefined;
  }
}

function hoverButton(title: string, icon: SVGSVGElement, variant: "add" | "skip" | undefined, onClick: (e: MouseEvent) => void): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.title = title;
  if (variant) btn.classList.add(`action-${variant}`);
  btn.appendChild(icon);
  btn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    onClick(e);
  });
  return btn;
}

// The single place scene actions live — a compact icon row that only appears
// on hover, same for every section (Trending, New Releases): Play if it's
// already in the local Stash, otherwise a +/- pair for whatever the current
// status allows. Skip (-) permanently ignores the scene (api.ignoreScene) and
// removes the card via onRemove; already-monitored scenes only get a - to
// unmonitor, since the Monitored badge already communicates their state.
function renderHoverActions(s: Scene, status: SceneStatus | undefined, onStatusChange: () => void, onRemove: () => void): HTMLElement | undefined {
  if (!status) return undefined;
  const buttons: HTMLButtonElement[] = [];

  if (status.kind === "in-stash") {
    buttons.push(hoverButton("Play in local Stash", iconPlay(), undefined, () => window.open(status.localUrl, "_blank")));
  } else {
    if (status.kind === "not-added" && status.whisparrConfigured) {
      buttons.push(
        hoverButton("Add Scene", iconPlus(), "add", async (e) => {
          (e.currentTarget as HTMLButtonElement).disabled = true;
          await api.addToWhisparr(s.id);
          onStatusChange();
        }),
      );
    } else if (status.kind === "previously-added") {
      buttons.push(
        hoverButton("Re-enable monitoring", iconPlus(), "add", async (e) => {
          (e.currentTarget as HTMLButtonElement).disabled = true;
          await api.setMonitored(status.movieId, true);
          onStatusChange();
        }),
      );
    }

    if (status.kind === "monitored") {
      buttons.push(
        hoverButton("Unmonitor", iconMinus(), "skip", async (e) => {
          (e.currentTarget as HTMLButtonElement).disabled = true;
          await api.setMonitored(status.movieId, false);
          onStatusChange();
        }),
      );
    } else if (status.kind === "not-added" || status.kind === "previously-added") {
      buttons.push(
        hoverButton("Skip — permanently dismiss this scene", iconMinus(), "skip", async (e) => {
          (e.currentTarget as HTMLButtonElement).disabled = true;
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

export function renderSceneCard(s: Scene, status: SceneStatus | undefined, onStatusChange: () => void, onRemove: () => void): HTMLElement {
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
  const image = s.images[0];
  if (image) {
    const img = document.createElement("img");
    img.className = "SceneCard-image w-full h-full object-cover object-top block";
    img.src = image.url;
    img.alt = "";
    imageWrap.appendChild(img);
  } else {
    imageWrap.style.background = placeholderShade(s.id);
  }
  if (s.duration) {
    const duration = document.createElement("span");
    duration.className = "SceneCard-duration";
    duration.textContent = formatDuration(s.duration);
    imageWrap.appendChild(duration);
  }
  const hover = renderHoverActions(s, status, onStatusChange, onRemove);
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

  card.appendChild(footer);
  return card;
}
