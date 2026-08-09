import { api, type StatsSummary } from "../api.js";
import { iconRefresh } from "../icons.js";

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
  btn.className = "flex items-center justify-center text-muted hover:text-link";
  btn.title = "Refresh";
  btn.appendChild(iconRefresh());
  btn.addEventListener("click", onClick);
  return btn;
}

const CHART_HEIGHT_PX = 120;
const Y_AXIS_WIDTH_PX = 28;
const X_LABEL_INTERVAL = 5;

function formatShortDate(isoDate: string): string {
  return new Date(`${isoDate}T00:00:00Z`).toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });
}

function renderTimeline(timeline: StatsSummary["timeline"]): HTMLElement {
  const wrap = document.createElement("div");
  wrap.className = "bg-surface rounded-lg p-3.5 flex flex-col gap-2";

  const h = document.createElement("h4");
  h.className = "m-0 text-sm";
  h.textContent = "Added to Whisparr — Last 30 Days";
  wrap.appendChild(h);

  if (timeline.length === 0) {
    const p = document.createElement("p");
    p.className = "text-muted text-sm";
    p.textContent = "Nothing added yet.";
    wrap.appendChild(p);
    return wrap;
  }

  const maxCount = Math.max(1, ...timeline.map((d) => d.count));
  const midCount = Math.round(maxCount / 2);

  // Y axis: tick labels for 0 / mid / max, right-aligned against the chart.
  const yAxis = document.createElement("div");
  yAxis.className = "shrink-0 flex flex-col justify-between text-right text-[10px] text-muted";
  yAxis.style.height = `${CHART_HEIGHT_PX}px`;
  yAxis.style.width = `${Y_AXIS_WIDTH_PX}px`;
  for (const v of [maxCount, midCount, 0]) {
    const tick = document.createElement("span");
    tick.textContent = String(v);
    yAxis.appendChild(tick);
  }

  // Chart area: gridlines at the same 0/mid/max levels, bars absolutely
  // positioned to fill the area so bottom-anchoring doesn't depend on
  // flexbox stretch behavior of nested percentage heights.
  const chartArea = document.createElement("div");
  chartArea.className = "relative flex-1";
  chartArea.style.height = `${CHART_HEIGHT_PX}px`;

  for (const frac of [0, 0.5, 1]) {
    const gridline = document.createElement("div");
    gridline.className = "absolute left-0 right-0 border-t border-white/10";
    gridline.style.top = `${frac * 100}%`;
    chartArea.appendChild(gridline);
  }

  const bars = document.createElement("div");
  bars.className = "absolute inset-0 flex items-end gap-[2px]";
  for (const day of timeline) {
    const bar = document.createElement("div");
    bar.className = "flex-1 bg-accent rounded-t-sm hover:brightness-125";
    const heightPx = Math.max(2, Math.round((day.count / maxCount) * CHART_HEIGHT_PX));
    bar.style.height = `${heightPx}px`;
    bar.title = `${formatShortDate(day.date)}: ${day.count} scene${day.count === 1 ? "" : "s"}`;
    bars.appendChild(bar);
  }
  chartArea.appendChild(bars);

  const chartRow = document.createElement("div");
  chartRow.className = "flex gap-2";
  chartRow.appendChild(yAxis);
  chartRow.appendChild(chartArea);
  wrap.appendChild(chartRow);

  // X axis: one flex-1 slot per day (same gap as the bars) so labels line up
  // under their bar exactly; only every X_LABEL_INTERVAL-th (plus the last)
  // actually shows text, to avoid 30 crowded labels.
  const xAxisRow = document.createElement("div");
  xAxisRow.className = "flex gap-2";
  const xAxisSpacer = document.createElement("div");
  xAxisSpacer.className = "shrink-0";
  xAxisSpacer.style.width = `${Y_AXIS_WIDTH_PX}px`;
  const xAxis = document.createElement("div");
  xAxis.className = "flex-1 flex gap-[2px] text-[10px] text-muted";
  timeline.forEach((day, i) => {
    const label = document.createElement("span");
    label.className = "flex-1 text-center overflow-hidden text-ellipsis whitespace-nowrap";
    if (i % X_LABEL_INTERVAL === 0 || i === timeline.length - 1) label.textContent = formatShortDate(day.date);
    xAxis.appendChild(label);
  });
  xAxisRow.appendChild(xAxisSpacer);
  xAxisRow.appendChild(xAxis);
  wrap.appendChild(xAxisRow);

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
