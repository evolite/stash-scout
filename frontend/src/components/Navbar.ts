import { api } from "../api.js";

export type Tab = "browse" | "subscribed" | "performers" | "studios" | "stats" | "settings";

const LEFT_TABS: { id: Tab; label: string }[] = [
  { id: "subscribed", label: "Feed" },
  { id: "browse", label: "Scenes" },
  { id: "performers", label: "Performers" },
  { id: "studios", label: "Studios" },
  { id: "stats", label: "Stats" },
];

const TAB_BASE = "flex items-center h-8 px-3 rounded text-sm font-medium transition-colors duration-150";
const TAB_ACTIVE = TAB_BASE + " bg-surface-2 text-text";
const TAB_INACTIVE = TAB_BASE + " text-muted hover:text-text hover:bg-surface-2/60";

function renderTabs(tabs: { id: Tab; label: string }[], active: Tab, onSelect: (tab: Tab) => void): HTMLElement {
  const wrap = document.createElement("div");
  wrap.className = "flex gap-1 h-full items-center";
  for (const tab of tabs) {
    const el = document.createElement("button");
    el.type = "button";
    el.className = tab.id === active ? TAB_ACTIVE : TAB_INACTIVE;
    el.setAttribute("aria-current", tab.id === active ? "page" : "false");
    el.textContent = tab.label;
    el.addEventListener("click", () => onSelect(tab.id));
    wrap.appendChild(el);
  }
  return wrap;
}

// Quieter than the primary tabs on purpose — Settings is a persistent utility
// link, not a content section competing for attention.
const UTILITY_TAB_BASE = "flex items-center gap-1.5 h-8 px-3 rounded text-sm transition-colors duration-150";
const UTILITY_TAB_ACTIVE = UTILITY_TAB_BASE + " bg-surface-2 text-muted";
const UTILITY_TAB_INACTIVE = UTILITY_TAB_BASE + " text-text-faint hover:text-muted hover:bg-surface-2/60";

function renderSettingsTab(active: Tab, onSelect: (tab: Tab) => void): HTMLElement {
  const el = document.createElement("button");
  el.type = "button";
  const isActive = active === "settings";
  el.className = isActive ? UTILITY_TAB_ACTIVE : UTILITY_TAB_INACTIVE;
  el.setAttribute("aria-current", isActive ? "page" : "false");
  el.appendChild(iconGear());
  el.appendChild(document.createTextNode("Settings"));
  el.addEventListener("click", () => onSelect("settings"));
  return el;
}

function iconGear(): SVGSVGElement {
  const NS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", "0 0 16 16");
  svg.setAttribute("width", "13");
  svg.setAttribute("height", "13");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "1.5");
  svg.setAttribute("aria-hidden", "true");
  const circle = document.createElementNS(NS, "circle");
  circle.setAttribute("cx", "8");
  circle.setAttribute("cy", "8");
  circle.setAttribute("r", "2.25");
  svg.appendChild(circle);
  const path = document.createElementNS(NS, "path");
  path.setAttribute(
    "d",
    "M8 1.5v1.4M8 13.1v1.4M14.5 8h-1.4M2.9 8H1.5M12.5 3.5l-1 1M4.5 11.5l-1 1M12.5 12.5l-1-1M4.5 4.5l-1-1",
  );
  path.setAttribute("stroke-linecap", "round");
  svg.appendChild(path);
  return svg;
}

// A small mark, not a logo image — a magnifying glass reads as "scout/search"
// at 18px without needing an asset file.
function renderLogoMark(): SVGSVGElement {
  const NS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", "18");
  svg.setAttribute("height", "18");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "2");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("aria-hidden", "true");
  svg.classList.add("text-accent");
  const circle = document.createElementNS(NS, "circle");
  circle.setAttribute("cx", "10");
  circle.setAttribute("cy", "10");
  circle.setAttribute("r", "6");
  svg.appendChild(circle);
  const line = document.createElementNS(NS, "line");
  line.setAttribute("x1", "15");
  line.setAttribute("y1", "15");
  line.setAttribute("x2", "20.5");
  line.setAttribute("y2", "20.5");
  svg.appendChild(line);
  return svg;
}

const SFW_KEY = "sfwMode";

function isSfwMode(): boolean {
  return localStorage.getItem(SFW_KEY) === "1";
}

function setSfwMode(on: boolean): void {
  localStorage.setItem(SFW_KEY, on ? "1" : "0");
  document.documentElement.classList.toggle("sfw", on);
}

setSfwMode(isSfwMode());

// Populated once at module load — non-secret, only used to build link hrefs.
// The navbar can render before this resolves (it's a fetch), so both
// refresh functions below are re-run once config lands to fix up whatever
// already rendered with an empty URL.
let localStashRootUrl = "";
let whisparrBaseUrl = "";
// Fire-and-forget, NOT awaited — a top-level await here would suspend this
// module's evaluation (and thus main.ts's first render()) on a network round
// trip. The refresh functions below back-fill whatever already rendered.
async function loadNavbarConfig(): Promise<void> {
  try {
    const cfg = await api.getConfig();
    localStashRootUrl = cfg.localStashRootUrl ?? "";
    whisparrBaseUrl = cfg.whisparrBaseUrl ?? "";
    refreshStashLinks();
    refreshBadgeVisibility();
    refreshDownloadingBadges();
  } catch {
    // leave both empty — links just won't render
  }
}
void loadNavbarConfig();

// Off by default — Feed/Trending hide scenes already in the library unless
// this is switched on. Read by SubscribedView.ts when building its queries.
const IN_LIBRARY_KEY = "inLibraryMode";

export function isInLibraryMode(): boolean {
  return localStorage.getItem(IN_LIBRARY_KEY) === "1";
}

function setInLibraryMode(on: boolean): void {
  localStorage.setItem(IN_LIBRARY_KEY, on ? "1" : "0");
}

// Bundled locally (frontend/public/brand) rather than hotlinked from each
// app's own instance URL — those are often only reachable from the server,
// not from whatever machine the browser is on, so a live favicon fetch would
// silently fail. Official assets: stashapp/Stash-Docs favicon.ico, and
// Whisparr/Whisparr Logo/32.png (brand color #FF69B4 sampled from its SVG logo).
const STASH_ICON_SRC = "/brand/stash.ico";
const STASH_COLOR = "#c98f5e";
const WHISPARR_ICON_SRC = "/brand/whisparr.png";
const WHISPARR_COLOR = "#ff69b4";

// Both brand pills (Stash link, Whisparr/downloading badge) share this exact
// shape so they read as one matched pair in the navbar.
const BRAND_PILL_BASE =
  "flex-col justify-center gap-1 h-8 px-3 rounded text-sm text-text-faint no-underline hover:no-underline " +
  "hover:text-muted hover:bg-surface-2/60 hover:-translate-y-0.5 transition duration-150";

function brandIcon(src: string, alt: string): HTMLImageElement {
  const img = document.createElement("img");
  img.src = src;
  img.alt = alt;
  img.width = 16;
  img.height = 16;
  img.className = "rounded-sm";
  return img;
}

// Doubles as a Whisparr shortcut when idle — an empty "0 downloading" badge
// on every page is noise, but an empty slot is wasted space, so it becomes a
// plain link out to Whisparr until there's actually something to report.
const DOWNLOADING_POLL_MS = 20_000;

// main.ts fully re-renders the navbar (root.innerHTML = "") on every tab
// switch, so renderDownloadingBadge/renderStashLink below just repoint this
// at whichever instance is currently mounted, rather than looking it up via
// document.querySelectorAll — which finds nothing when refresh runs at
// creation time, before renderNavbar has appended the returned element.
let currentBadge: HTMLAnchorElement | null = null;

// Visibility + link target depend only on whether Whisparr is configured
// (a fast local /api/settings/config call), NOT on the slow /api/stats proxy
// below. Runs at badge creation — so on any navigation after the first load,
// where module-level whisparrBaseUrl is already populated, the icon appears
// synchronously — and again once getConfig() lands on the first load.
function refreshBadgeVisibility(): void {
  const badge = currentBadge;
  if (!badge) return;
  if (!whisparrBaseUrl) {
    badge.classList.add("hidden");
    badge.classList.remove("flex");
    return;
  }
  // Always a link to Whisparr — only the label/progress-bar content changes.
  badge.href = whisparrBaseUrl;
  badge.target = "_blank";
  badge.rel = "noopener";
  const label = badge.querySelector<HTMLElement>(".js-dl-label")!;
  // Kept the same brand color in both states — an inline color always
  // wins over the pill's hover:text-muted, so hovering the badge can't
  // flash the label a different shade than the idle Stash/Whisparr links.
  label.style.color = WHISPARR_COLOR;
  // Default until /api/stats reports otherwise, so first paint isn't blank.
  if (!label.textContent) label.textContent = "Whisparr";
  badge.classList.remove("hidden");
  badge.classList.add("flex");
}

async function refreshDownloadingBadges(): Promise<void> {
  const badge = currentBadge;
  if (!badge) return;
  try {
    const stats = await api.stats();
    const label = badge.querySelector<HTMLElement>(".js-dl-label")!;
    const donut = badge.querySelector<HTMLElement>(".js-dl-donut")!;
    const icon = badge.querySelector<HTMLElement>(".js-dl-icon")!;
    if (stats.downloading > 0) {
      // While downloading, the donut stands in for the brand icon.
      label.textContent = `${stats.downloading} downloading`;
      const pct = Math.max(0, Math.min(100, stats.downloadProgress ?? 0));
      donut.style.background = `conic-gradient(${WHISPARR_COLOR} ${pct}%, rgba(255,255,255,0.15) 0)`;
      donut.classList.remove("hidden");
      icon.classList.add("hidden");
    } else {
      label.textContent = "Whisparr";
      donut.classList.add("hidden");
      icon.classList.remove("hidden");
    }
  } catch {
    // leave the badge as-is on a failed refresh
  }
}

// Started once at module load rather than per render, driving whichever
// badge is currently mounted via the module-level reference above.
setInterval(refreshDownloadingBadges, DOWNLOADING_POLL_MS);

function renderDownloadingBadge(): HTMLElement {
  const badge = document.createElement("a");
  badge.className = `hidden js-downloading-badge ${BRAND_PILL_BASE}`;

  const row = document.createElement("span");
  row.className = "flex items-center gap-1.5";
  const icon = brandIcon(WHISPARR_ICON_SRC, "Whisparr");
  icon.classList.add("js-dl-icon");
  row.appendChild(icon);

  // Inline donut (conic-gradient ring) rather than a progress bar below the
  // row — a bar made the flex-col pill grow taller, nudging the Whisparr
  // icon/text out of vertical alignment with the Stash link next to it.
  // Sits right before the label so the ring and the "N downloading" count
  // read as one unit. h-4/w-4 to match the 16px brand icon's line box.
  const donut = document.createElement("span");
  donut.className = "js-dl-donut hidden h-4 w-4 shrink-0 self-center rounded-full";
  const hole = "radial-gradient(closest-side, transparent 62%, #000 63%)";
  donut.style.setProperty("mask", hole);
  donut.style.setProperty("-webkit-mask", hole);
  row.appendChild(donut);

  const label = document.createElement("span");
  label.className = "js-dl-label";
  row.appendChild(label);
  badge.appendChild(row);

  currentBadge = badge;
  refreshBadgeVisibility();
  refreshDownloadingBadges();
  return badge;
}

let currentStashLink: HTMLAnchorElement | null = null;

function refreshStashLinks(): void {
  const el = currentStashLink;
  if (!el) return;
  if (!localStashRootUrl) {
    el.classList.add("hidden");
    el.classList.remove("flex");
    return;
  }
  el.href = localStashRootUrl;
  el.classList.remove("hidden");
  el.classList.add("flex");
}

function renderStashLink(): HTMLElement {
  const el = document.createElement("a");
  el.className = `hidden ${BRAND_PILL_BASE}`;
  el.target = "_blank";
  el.rel = "noopener";

  const row = document.createElement("span");
  row.className = "flex items-center gap-1.5";
  row.appendChild(brandIcon(STASH_ICON_SRC, "Stash"));
  const label = document.createElement("span");
  label.textContent = "Stash";
  label.style.color = STASH_COLOR;
  row.appendChild(label);
  el.appendChild(row);

  currentStashLink = el;
  refreshStashLinks();
  return el;
}

const TRACK_BASE = "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full p-0.5 transition-colors duration-150";
const THUMB_BASE = "inline-block h-4 w-4 rounded-full bg-white transition-transform duration-150";

function renderToggle(label: string, isOn: () => boolean, setOn: (on: boolean) => void, onChange?: () => void): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.setAttribute("role", "switch");
  btn.className = "flex items-center gap-2 text-xs text-text-faint hover:text-muted transition-colors duration-150";

  const labelEl = document.createElement("span");
  labelEl.textContent = label;
  btn.appendChild(labelEl);

  const track = document.createElement("span");
  const thumb = document.createElement("span");
  track.appendChild(thumb);
  btn.appendChild(track);

  const apply = () => {
    const on = isOn();
    track.className = TRACK_BASE + " border" + (on ? " bg-accent border-accent" : " bg-white/5 border-line");
    thumb.className = THUMB_BASE + (on ? " translate-x-4" : " translate-x-0 bg-text-faint");
    btn.setAttribute("aria-checked", String(on));
  };
  btn.addEventListener("click", () => {
    setOn(!isOn());
    apply();
    onChange?.();
  });
  apply();
  return btn;
}

// onLibraryToggle: the app's simple full-rerender-on-change model (see
// main.ts's setTab) doesn't otherwise reach the "In Library" state into
// SubscribedView's already-mounted sections — clicking the toggle re-renders the
// whole app so Feed/Trending re-fetch with the new setting immediately.
export function renderNavbar(active: Tab, onSelect: (tab: Tab) => void, onLibraryToggle: () => void): HTMLElement {
  const nav = document.createElement("nav");
  nav.className = "flex items-center justify-between bg-navbar px-6 h-14";

  const left = document.createElement("div");
  left.className = "flex items-center gap-6 h-full";
  const brand = document.createElement("div");
  brand.className = "flex items-center gap-2 font-bold text-text";
  brand.appendChild(renderLogoMark());
  const brandText = document.createElement("span");
  brandText.textContent = "Stash Scout";
  brand.appendChild(brandText);
  left.appendChild(brand);
  left.appendChild(renderTabs(LEFT_TABS, active, onSelect));
  nav.appendChild(left);

  const right = document.createElement("div");
  right.className = "flex items-center gap-4 h-full";
  right.appendChild(renderStashLink());
  right.appendChild(renderDownloadingBadge());
  right.appendChild(renderToggle("In Library", isInLibraryMode, setInLibraryMode, onLibraryToggle));
  right.appendChild(renderToggle("SFW Mode", isSfwMode, setSfwMode));
  right.appendChild(renderSettingsTab(active, onSelect));
  nav.appendChild(right);

  return nav;
}
