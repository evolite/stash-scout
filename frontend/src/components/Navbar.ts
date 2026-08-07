export type Tab = "browse" | "watched" | "stats" | "settings";

const LEFT_TABS: { id: Tab; label: string }[] = [
  { id: "watched", label: "Feed" },
  { id: "browse", label: "Filters" },
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

const TRACK_BASE = "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full p-0.5 transition-colors duration-150";
const THUMB_BASE = "inline-block h-4 w-4 rounded-full bg-white transition-transform duration-150";

function renderSfwToggle(): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.setAttribute("role", "switch");
  btn.className = "flex items-center gap-2 text-xs text-text-faint hover:text-muted transition-colors duration-150";

  const label = document.createElement("span");
  label.textContent = "SFW Mode";
  btn.appendChild(label);

  const track = document.createElement("span");
  const thumb = document.createElement("span");
  track.appendChild(thumb);
  btn.appendChild(track);

  const apply = () => {
    const on = isSfwMode();
    track.className = TRACK_BASE + " border" + (on ? " bg-accent border-accent" : " bg-white/5 border-line");
    thumb.className = THUMB_BASE + (on ? " translate-x-4" : " translate-x-0 bg-text-faint");
    btn.setAttribute("aria-checked", String(on));
  };
  btn.addEventListener("click", () => {
    setSfwMode(!isSfwMode());
    apply();
  });
  apply();
  return btn;
}

export function renderNavbar(active: Tab, onSelect: (tab: Tab) => void): HTMLElement {
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
  right.appendChild(renderSfwToggle());
  right.appendChild(renderSettingsTab(active, onSelect));
  nav.appendChild(right);

  return nav;
}
