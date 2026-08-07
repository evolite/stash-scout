export type Tab = "browse" | "watched" | "stats" | "settings";

const LEFT_TABS: { id: Tab; label: string }[] = [
  { id: "watched", label: "Feed" },
  { id: "browse", label: "Filters" },
  { id: "stats", label: "Stats" },
];
const RIGHT_TABS: { id: Tab; label: string }[] = [{ id: "settings", label: "⚙ Settings" }];

const TAB_BASE = "flex items-center h-full px-2 border-b-2";
const TAB_ACTIVE = TAB_BASE + " border-link text-link font-bold";
const TAB_INACTIVE = TAB_BASE + " border-transparent text-text hover:border-white";

function renderTabs(tabs: { id: Tab; label: string }[], active: Tab, onSelect: (tab: Tab) => void): HTMLElement {
  const wrap = document.createElement("div");
  wrap.className = "flex gap-1 h-full";
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
  btn.className = "flex items-center gap-2 text-xs font-medium text-muted";

  const label = document.createElement("span");
  label.textContent = "SFW Mode";
  btn.appendChild(label);

  const track = document.createElement("span");
  const thumb = document.createElement("span");
  track.appendChild(thumb);
  btn.appendChild(track);

  const apply = () => {
    const on = isSfwMode();
    track.className = TRACK_BASE + (on ? " bg-link" : " bg-white/10");
    thumb.className = THUMB_BASE + (on ? " translate-x-4" : " translate-x-0");
    btn.setAttribute("aria-checked", String(on));
    btn.classList.toggle("text-text", on);
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
  brand.className = "font-bold text-link";
  brand.textContent = "Stash Scout";
  left.appendChild(brand);
  left.appendChild(renderTabs(LEFT_TABS, active, onSelect));
  nav.appendChild(left);

  const right = document.createElement("div");
  right.className = "flex items-center gap-6 h-full";
  right.appendChild(renderSfwToggle());
  right.appendChild(renderTabs(RIGHT_TABS, active, onSelect));
  nav.appendChild(right);

  return nav;
}
