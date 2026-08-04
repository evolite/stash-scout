export type Tab = "browse" | "watched" | "settings";

const TABS: { id: Tab; label: string }[] = [
  { id: "watched", label: "Watched" },
  { id: "browse", label: "Browse" },
  { id: "settings", label: "Settings" },
];

export function renderNavbar(active: Tab, onSelect: (tab: Tab) => void): HTMLElement {
  const nav = document.createElement("nav");
  nav.className = "Navbar";

  const brand = document.createElement("div");
  brand.className = "Navbar-brand";
  brand.textContent = "stashdb-browser";
  nav.appendChild(brand);

  const tabs = document.createElement("div");
  tabs.className = "Navbar-tabs";
  for (const tab of TABS) {
    const el = document.createElement("div");
    el.className = "Navbar-tab" + (tab.id === active ? " active" : "");
    el.textContent = tab.label;
    el.addEventListener("click", () => onSelect(tab.id));
    tabs.appendChild(el);
  }
  nav.appendChild(tabs);

  return nav;
}
