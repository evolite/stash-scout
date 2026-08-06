export type Tab = "browse" | "watched" | "favorites" | "settings";

const TABS: { id: Tab; label: string }[] = [
  { id: "watched", label: "Feed" },
  { id: "favorites", label: "Favorites" },
  { id: "browse", label: "Browse" },
  { id: "settings", label: "Settings" },
];

const TAB_BASE = "flex items-center h-full px-2 border-b-2";
const TAB_ACTIVE = TAB_BASE + " border-link text-link font-bold";
const TAB_INACTIVE = TAB_BASE + " border-transparent text-text hover:border-white";

export function renderNavbar(active: Tab, onSelect: (tab: Tab) => void): HTMLElement {
  const nav = document.createElement("nav");
  nav.className = "flex items-center gap-6 bg-navbar px-6 h-14";

  const brand = document.createElement("div");
  brand.className = "font-bold text-link";
  brand.textContent = "stashdb-browser";
  nav.appendChild(brand);

  const tabs = document.createElement("div");
  tabs.className = "flex gap-1 h-full";
  for (const tab of TABS) {
    const el = document.createElement("button");
    el.type = "button";
    el.className = tab.id === active ? TAB_ACTIVE : TAB_INACTIVE;
    el.setAttribute("aria-current", tab.id === active ? "page" : "false");
    el.textContent = tab.label;
    el.addEventListener("click", () => onSelect(tab.id));
    tabs.appendChild(el);
  }
  nav.appendChild(tabs);

  return nav;
}
