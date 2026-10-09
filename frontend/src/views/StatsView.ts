import { api, type StatsSummary } from "../api.js";
import { iconRefresh } from "../icons.js";

const CARD = "bg-surface border border-line rounded-lg";
const SECTION_LABEL = "m-0 text-[11px] font-medium uppercase tracking-wider text-text-faint";

function el(tag: string, className: string, text?: string): HTMLElement {
  const e = document.createElement(tag);
  e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}

const fmt = (n: number) => n.toLocaleString();

function renderHero(s: StatsSummary): HTMLElement {
  const card = el("div", `${CARD} p-5 flex flex-col gap-4`);
  const top = el("div", "flex items-end justify-between gap-4 flex-wrap");
  const left = el("div", "flex flex-col gap-1");
  left.appendChild(el("h4", SECTION_LABEL, "In Whisparr"));
  left.appendChild(el("div", "text-4xl font-semibold tabular-nums leading-none", fmt(s.totalInWhisparr)));
  top.appendChild(left);
  const pct = s.totalInWhisparr ? Math.round((s.downloaded / s.totalInWhisparr) * 100) : 0;
  top.appendChild(el("div", "text-sm text-muted tabular-nums", `${pct}% downloaded`));
  card.appendChild(top);

  const segments = [
    { label: "Downloaded", n: s.downloaded, color: "bg-success" },
    { label: "Downloading", n: s.downloading, color: "bg-accent" },
    { label: "Wanted", n: s.wanted, color: "bg-warning" },
    { label: "Unmonitored", n: s.unmonitored, color: "bg-text-faint" },
  ];
  // Total-zero → empty track only (no divide-by-zero).
  const bar = el("div", "flex h-2 rounded-full overflow-hidden bg-surface-3 gap-px");
  for (const seg of segments) {
    if (!seg.n || !s.totalInWhisparr) continue;
    const part = el("div", seg.color);
    part.style.flex = `${seg.n} 0 0`;
    part.title = `${seg.label}: ${fmt(seg.n)}`;
    bar.appendChild(part);
  }
  card.appendChild(bar);

  const legend = el("div", "grid gap-3 grid-cols-[repeat(auto-fit,minmax(110px,1fr))]");
  for (const seg of segments) {
    const item = el("div", "flex flex-col gap-0.5");
    const label = el("div", "flex items-center gap-1.5 text-xs text-muted");
    label.appendChild(el("span", `inline-block w-2 h-2 rounded-full ${seg.color}`));
    label.appendChild(document.createTextNode(seg.label));
    const value = el("div", "text-lg font-semibold tabular-nums", fmt(seg.n));
    if (seg.label === "Downloading" && seg.n > 0 && s.downloadProgress != null) {
      value.appendChild(el("span", "ml-1.5 text-sm font-normal text-accent", `${s.downloadProgress}%`));
    }
    item.appendChild(label);
    item.appendChild(value);
    legend.appendChild(item);
  }
  card.appendChild(legend);

  if (s.downloading > 0 && s.downloadProgress != null) {
    const track = el("div", "h-1 rounded-full bg-surface-3 overflow-hidden");
    const fill = el("div", "h-full bg-accent");
    fill.style.width = `${s.downloadProgress}%`;
    track.appendChild(fill);
    card.appendChild(track);
  }
  return card;
}

function renderSecondary(s: StatsSummary): HTMLElement {
  const row = el("div", `${CARD} px-5 py-3 grid grid-cols-3 gap-4`);
  for (const [label, n] of [
    ["Saved filters", s.savedFiltersCount],
    ["Subscribed", s.subscribedFiltersCount],
    ["Ignored scenes", s.ignoredCount],
  ] as const) {
    const cell = el("div", "flex flex-col gap-0.5");
    cell.appendChild(el("div", "text-xs text-muted", label));
    cell.appendChild(el("div", "text-xl font-semibold tabular-nums", fmt(n)));
    row.appendChild(cell);
  }
  return row;
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
  wrap.className = `${CARD} p-4 flex flex-col gap-3`;

  const h = document.createElement("h4");
  h.className = SECTION_LABEL;
  h.textContent = "Added to Whisparr · Last 30 days";
  wrap.appendChild(h);

  if (timeline.length === 0) {
    const p = document.createElement("p");
    p.className = "text-muted text-sm";
    p.textContent = "Nothing added yet.";
    wrap.appendChild(p);
    return wrap;
  }

  const total = timeline.reduce((n, d) => n + d.count, 0);
  const best = timeline.reduce((m, d) => (d.count > m.count ? d : m), timeline[0]);
  const summary = el("div", "flex gap-6 flex-wrap");
  for (const [label, value] of [
    ["Added", fmt(total)],
    ["Daily avg", (total / timeline.length).toFixed(1)],
    ["Best day", best.count ? `${best.count} · ${formatShortDate(best.date)}` : "—"],
  ]) {
    const cell = el("div", "flex flex-col gap-0.5");
    cell.appendChild(el("div", "text-xs text-muted", label));
    cell.appendChild(el("div", "text-lg font-semibold tabular-nums", value));
    summary.appendChild(cell);
  }
  wrap.appendChild(summary);

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
    gridline.className = "absolute left-0 right-0 border-t border-line/60";
    gridline.style.top = `${frac * 100}%`;
    chartArea.appendChild(gridline);
  }

  const bars = document.createElement("div");
  bars.className = "absolute inset-0 flex items-end gap-[2px]";
  for (const day of timeline) {
    const bar = document.createElement("div");
    const isToday = day === timeline[timeline.length - 1];
    bar.className = `flex-1 rounded-t-sm hover:bg-accent ${day.count === 0 ? "bg-line" : isToday ? "bg-accent" : "bg-accent/60"}`;
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
  body.className = "flex flex-col gap-4";
  const loading = document.createElement("p");
  loading.className = "text-muted text-sm";
  loading.textContent = "Loading…";
  body.appendChild(loading);
  container.appendChild(body);

  async function load() {
    let stats: StatsSummary;
    try {
      stats = await api.stats();
    } catch (err) {
      body.innerHTML = "";
      body.appendChild(el("p", "text-danger text-sm", `Couldn't load stats: ${(err as Error).message}`));
      return;
    }
    body.innerHTML = "";

    body.appendChild(renderHero(stats));
    body.appendChild(renderSecondary(stats));

    body.appendChild(renderTimeline(stats.timeline));
  }

  headingRow.appendChild(renderRefreshButton(() => load()));
  load();

  return container;
}
