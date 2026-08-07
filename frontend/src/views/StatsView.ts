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

const CHART_HEIGHT_PX = 96;

function formatShortDate(isoDate: string): string {
  return new Date(`${isoDate}T00:00:00Z`).toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });
}

function renderTimeline(timeline: StatsSummary["timeline"]): HTMLElement {
  const wrap = document.createElement("div");
  wrap.className = "bg-surface rounded-lg p-3.5 flex flex-col gap-2";

  const header = document.createElement("div");
  header.className = "flex items-baseline justify-between";
  const h = document.createElement("h4");
  h.className = "m-0 text-sm";
  h.textContent = "Added to Whisparr — Last 30 Days";
  header.appendChild(h);
  wrap.appendChild(header);

  if (timeline.length === 0) {
    const p = document.createElement("p");
    p.className = "text-muted text-sm";
    p.textContent = "Nothing added yet.";
    wrap.appendChild(p);
    return wrap;
  }

  const maxCount = Math.max(1, ...timeline.map((d) => d.count));
  const maxLabel = document.createElement("span");
  maxLabel.className = "text-xs text-muted";
  maxLabel.textContent = `peak: ${maxCount}/day`;
  header.appendChild(maxLabel);

  const chart = document.createElement("div");
  chart.className = "flex items-end gap-[2px]";
  chart.style.height = `${CHART_HEIGHT_PX}px`;
  for (const day of timeline) {
    const barWrap = document.createElement("div");
    barWrap.className = "flex-1 h-full flex items-end";
    const bar = document.createElement("div");
    bar.className = "w-full bg-accent rounded-t-sm hover:brightness-125";
    const heightPx = Math.max(2, Math.round((day.count / maxCount) * CHART_HEIGHT_PX));
    bar.style.height = `${heightPx}px`;
    bar.title = `${formatShortDate(day.date)}: ${day.count} scene${day.count === 1 ? "" : "s"}`;
    barWrap.appendChild(bar);
    chart.appendChild(barWrap);
  }
  wrap.appendChild(chart);

  const axis = document.createElement("div");
  axis.className = "flex justify-between text-xs text-muted";
  const start = document.createElement("span");
  start.textContent = formatShortDate(timeline[0].date);
  const end = document.createElement("span");
  end.textContent = formatShortDate(timeline[timeline.length - 1].date);
  axis.appendChild(start);
  axis.appendChild(end);
  wrap.appendChild(axis);

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

    body.appendChild(renderTimeline(stats.timeline));
  }

  headingRow.appendChild(renderRefreshButton(() => load()));
  load();

  return container;
}
