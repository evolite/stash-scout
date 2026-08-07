export type Tab = "browse" | "watched" | "stats" | "settings";

const LEFT_TABS: { id: Tab; label: string }[] = [
  { id: "watched", label: "Feed" },
  { id: "browse", label: "Browse" },
  { id: "stats", label: "Stats" },
];
const RIGHT_TABS: { id: Tab; label: string }[] = [{ id: "settings", label: "Settings" }];

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

export function renderNavbar(active: Tab, onSelect: (tab: Tab) => void): HTMLElement {
  const nav = document.createElement("nav");
  nav.className = "flex items-center justify-between bg-navbar px-6 h-14";

  nav.appendChild(renderTabs(LEFT_TABS, active, onSelect));

  const right = document.createElement("div");
  right.className = "flex items-center gap-6 h-full";
  const brand = document.createElement("div");
  brand.className = "font-bold text-link";
  brand.textContent = "stashdb-browser";
  right.appendChild(brand);
  right.appendChild(renderTabs(RIGHT_TABS, active, onSelect));
  nav.appendChild(right);

  return nav;
}
