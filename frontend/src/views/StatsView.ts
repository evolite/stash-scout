import { api, type StatsSummary } from "../api.js";

const TILE = "bg-surface rounded-lg p-3.5 flex flex-col gap-1";
const TILE_VALUE = "text-2xl font-bold";
const TILE_LABEL = "text-xs text-muted";

function tile(label: string, value: number): HTMLElement {
  const el = document.createElement("div");
  el.className = TILE;
  const v = document.createElement("div");
  v.className = TILE_VALUE;
  v.textContent = String(value);
  const l = document.createElement("div");
  l.className = TILE_LABEL;
  l.textContent = label;
  el.appendChild(v);
  el.appendChild(l);
  return el;
}

function renderRefreshButton(onClick: () => void): HTMLElement {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "text-muted hover:text-link text-sm";
  btn.title = "Refresh";
  btn.textContent = "↻";
  btn.addEventListener("click", onClick);
  return btn;
}

function renderRecentList(recentlyAdded: StatsSummary["recentlyAdded"]): HTMLElement {
  const wrap = document.createElement("div");
  wrap.className = "bg-surface rounded-lg p-3.5 flex flex-col gap-2";
  const h = document.createElement("h4");
  h.className = "m-0 text-sm";
  h.textContent = "Recently Added to Whisparr";
  wrap.appendChild(h);

  if (recentlyAdded.length === 0) {
    const p = document.createElement("p");
    p.className = "text-muted text-sm";
    p.textContent = "Nothing added yet.";
    wrap.appendChild(p);
    return wrap;
  }

  const list = document.createElement("ul");
  list.className = "flex flex-col gap-1.5 text-xs";
  for (const item of recentlyAdded) {
    const li = document.createElement("li");
    li.className = "flex justify-between gap-2";
    const title = document.createElement("span");
    title.className = "overflow-hidden text-ellipsis whitespace-nowrap";
    title.textContent = item.title;
    const date = document.createElement("span");
    date.className = "text-muted shrink-0";
    date.textContent = new Date(item.addedAt).toLocaleDateString();
    li.appendChild(title);
    li.appendChild(date);
    list.appendChild(li);
  }
  wrap.appendChild(list);
  return wrap;
}

export function renderStatsView(): HTMLElement {
  const container = document.createElement("div");
  container.className = "flex flex-col gap-3";

  const headingRow = document.createElement("div");
  headingRow.className = "flex items-center gap-2 mb-1.5";
  const heading = document.createElement("h3");
  heading.className = "text-base font-semibold";
  heading.textContent = "Stats";
  headingRow.appendChild(heading);
  container.appendChild(headingRow);

  const body = document.createElement("div");
  body.className = "flex flex-col gap-3";
  const loading = document.createElement("p");
  loading.className = "text-muted text-sm";
  loading.textContent = "Loading…";
  body.appendChild(loading);
  container.appendChild(body);

  async function load() {
    const stats = await api.stats();
    body.innerHTML = "";

    const grid = document.createElement("div");
    grid.className = "grid gap-4 grid-cols-[repeat(auto-fill,minmax(140px,1fr))]";
    grid.appendChild(tile("Monitored", stats.monitored));
    grid.appendChild(tile("Downloading", stats.downloading));
    grid.appendChild(tile("Previously Added", stats.previouslyAdded));
    grid.appendChild(tile("Ignored", stats.ignoredCount));
    grid.appendChild(tile("Saved Filters", stats.savedFiltersCount));
    grid.appendChild(tile("Watched Filters", stats.watchedFiltersCount));
    body.appendChild(grid);

    body.appendChild(renderRecentList(stats.recentlyAdded));
  }

  headingRow.appendChild(renderRefreshButton(() => load()));
  load();

  return container;
}
