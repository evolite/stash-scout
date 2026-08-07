import { api, type Scene, type SceneStatus } from "../api.js";
import { renderSceneCard } from "../components/SceneCard.js";
import { renderPagination } from "../components/Pagination.js";

const SECTION_PER_PAGE = 16;

type Window = "week" | "month" | "year";
const WINDOWS: { id: Window; label: string }[] = [
  { id: "week", label: "Week" },
  { id: "month", label: "Month" },
  { id: "year", label: "Year" },
];

const SUBTAB_BASE = "px-3 py-1.5 border-b-2";
const SUBTAB_ACTIVE = SUBTAB_BASE + " border-link text-link font-bold";
const SUBTAB_INACTIVE = SUBTAB_BASE + " border-transparent text-text hover:border-white";

const CHIP_BASE = "px-3 py-1.5 rounded-full border text-xs cursor-pointer transition-colors duration-150";
const CHIP_ACTIVE = CHIP_BASE + " border-link bg-link/15 text-text";
const CHIP_INACTIVE = CHIP_BASE + " border-white/10 text-muted hover:text-text";

function renderChip(label: string, active: boolean, onClick: () => void): HTMLButtonElement {
  const chip = document.createElement("button");
  chip.type = "button";
  chip.className = active ? CHIP_ACTIVE : CHIP_INACTIVE;
  chip.textContent = label;
  chip.addEventListener("click", onClick);
  return chip;
}

function textState(message: string): HTMLElement {
  const p = document.createElement("p");
  p.className = "text-muted text-sm";
  p.textContent = message;
  return p;
}

function renderRefreshButton(onClick: () => Promise<void>): HTMLElement {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "text-muted hover:text-link text-sm disabled:opacity-50";
  btn.title = "Refresh";
  btn.textContent = "↻";
  btn.addEventListener("click", async () => {
    btn.disabled = true;
    btn.classList.add("animate-spin");
    try {
      await onClick();
    } finally {
      btn.classList.remove("animate-spin");
      btn.disabled = false;
    }
  });
  return btn;
}

// Only shown on a section's very first load, when there's no prior content to
// keep on screen — a small centered spinner instead of placeholder cards that
// just get thrown away once real data lands.
function renderSpinner(): HTMLElement {
  const wrap = document.createElement("div");
  wrap.className = "col-span-full flex items-center justify-center py-12";
  const spinner = document.createElement("div");
  spinner.className = "w-6 h-6 rounded-full border-2 border-muted/30 border-t-accent animate-spin";
  wrap.appendChild(spinner);
  return wrap;
}

// A self-contained paginated scene grid — used for both the Feed and Trending
// halves of this view, each with their own page cursor and status polling.
function renderSceneSection(opts: {
  perPage: number;
  fetchPage: (page: number, refresh?: boolean) => Promise<{ count: number; scenes: Scene[]; approximateCount?: boolean }>;
  emptyMessage: string;
  onCount?: (count: number) => void;
}): { element: HTMLElement; reset: () => void; refresh: () => Promise<void> } {
  const element = document.createElement("div");
  const grid = document.createElement("div");
  grid.className = "grid gap-4 grid-cols-[repeat(auto-fill,minmax(240px,1fr))] transition-opacity duration-150";
  const paginationEl = document.createElement("div");
  element.appendChild(grid);
  element.appendChild(paginationEl);

  let page = 1;
  let statuses: Record<string, SceneStatus> = {};
  // The single source of truth for what's currently shown — status refreshes
  // (triggered by any card's Add/Monitor click) re-render from this, so an
  // ignored scene needs to actually leave this list, not just its DOM node.
  // Removing only the node let a later refreshStatuses() call (which closed
  // over the original fetch's full array) redraw the whole grid and bring
  // already-ignored cards right back.
  let currentScenes: Scene[] = [];

  function renderGrid() {
    grid.innerHTML = "";
    for (const scene of currentScenes) {
      const card = renderSceneCard(scene, statuses[scene.id], () => refreshStatuses(), () => {
        currentScenes = currentScenes.filter((s) => s.id !== scene.id);
        card.remove();
      });
      grid.appendChild(card);
    }
  }

  async function refreshStatuses() {
    statuses = await api.sceneStatuses(currentScenes.map((s) => s.id));
    renderGrid();
  }

  function updatePagination(count: number, approximate: boolean) {
    paginationEl.innerHTML = "";
    paginationEl.appendChild(
      renderPagination({
        page,
        perPage: opts.perPage,
        count,
        approximate,
        onPage: (p) => {
          page = p;
          load();
        },
      }),
    );
    opts.onCount?.(count);
  }

  // First load has nothing on screen yet, so show a spinner. Every later load
  // (pagination, window switch, refresh) keeps the current cards visible,
  // just dimmed, instead of tearing them out for placeholders that would only
  // get thrown away a moment later once the real results land.
  async function load(bypassCache = false) {
    const isFirstLoad = grid.children.length === 0;
    if (isFirstLoad) {
      grid.replaceChildren(renderSpinner());
    } else {
      grid.classList.add("opacity-40", "pointer-events-none");
    }

    const { count, scenes, approximateCount } = await opts.fetchPage(page, bypassCache);
    statuses = {};
    currentScenes = scenes;
    grid.classList.remove("opacity-40", "pointer-events-none");

    if (scenes.length === 0 && page === 1) {
      grid.innerHTML = "";
      grid.appendChild(textState(opts.emptyMessage));
      paginationEl.innerHTML = "";
      opts.onCount?.(0);
      return;
    }
    updatePagination(count, !!approximateCount);
    renderGrid();
    refreshStatuses();
  }

  function reset() {
    page = 1;
    load();
  }

  async function refresh() {
    await load(true);
  }

  load();
  return { element, reset, refresh };
}

export function renderWatchedView(): HTMLElement {
  const container = document.createElement("div");
  container.className = "flex flex-col gap-3";

  let window: Window = "week";
  let selectedSource: string | undefined; // undefined = "All matches"

  const feedWrap = document.createElement("div");
  const feedHeadingRow = document.createElement("div");
  feedHeadingRow.className = "flex items-center gap-2 mb-1.5";
  const feedHeading = document.createElement("h3");
  feedHeading.className = "text-base font-semibold";
  feedHeading.textContent = "New Releases";
  feedHeadingRow.appendChild(feedHeading);
  const pendingBadge = document.createElement("span");
  pendingBadge.className = "rounded-full bg-link/20 text-link text-[11px] font-bold px-2 py-0.5";
  pendingBadge.hidden = true;
  feedHeadingRow.appendChild(pendingBadge);
  feedWrap.appendChild(feedHeadingRow);

  const subTabs = document.createElement("div");
  subTabs.className = "flex gap-1 mb-2";
  for (const w of WINDOWS) {
    const el = document.createElement("button");
    el.type = "button";
    el.className = w.id === window ? SUBTAB_ACTIVE : SUBTAB_INACTIVE;
    el.setAttribute("aria-current", w.id === window ? "page" : "false");
    el.textContent = w.label;
    el.addEventListener("click", () => {
      if (window === w.id) return;
      window = w.id;
      for (const other of Array.from(subTabs.children)) {
        other.className = other === el ? SUBTAB_ACTIVE : SUBTAB_INACTIVE;
        other.setAttribute("aria-current", other === el ? "page" : "false");
      }
      feedSection.reset();
    });
    subTabs.appendChild(el);
  }
  feedWrap.appendChild(subTabs);

  // Filter-name chip bar — one chip per saved filter currently marked "watched"
  // (plus the always-on "Favorites" source), driven by real data from
  // /api/filters rather than hardcoded names.
  // ponytail: chips list every watched filter, not just ones with a match
  // right now (that needs a per-filter count query) — narrow to non-empty
  // filters later if an empty chip proves annoying in practice.
  const sourceChipBar = document.createElement("div");
  sourceChipBar.className = "flex gap-1.5 flex-wrap mb-3";
  feedWrap.appendChild(sourceChipBar);

  function renderSourceChips(names: string[]) {
    sourceChipBar.innerHTML = "";
    sourceChipBar.appendChild(
      renderChip("All matches", selectedSource === undefined, () => {
        selectedSource = undefined;
        renderSourceChips(names);
        feedSection.reset();
      }),
    );
    for (const name of names) {
      sourceChipBar.appendChild(
        renderChip(name, selectedSource === name, () => {
          selectedSource = name;
          renderSourceChips(names);
          feedSection.reset();
        }),
      );
    }
  }

  const FEED_LIMIT = 100;

  const feedSection = renderSceneSection({
    perPage: SECTION_PER_PAGE,
    fetchPage: async (page, refresh) => {
      const result = await api.watchedFeed(page, SECTION_PER_PAGE, window, selectedSource, refresh);
      return { ...result, count: Math.min(result.count, FEED_LIMIT), approximateCount: false };
    },
    emptyMessage: "Nothing here yet — watch a saved filter in Filters, or favorite performers on StashDB, to populate this feed.",
    onCount: (count) => {
      pendingBadge.hidden = count === 0;
      pendingBadge.textContent = `${count} pending`;
    },
  });
  feedHeadingRow.appendChild(renderRefreshButton(() => feedSection.refresh()));
  feedWrap.appendChild(feedSection.element);

  api.listFilters().then((filters) => {
    const names = filters.filter((f) => f.watched).map((f) => f.name);
    names.push("Favorites");
    renderSourceChips(names);
  });

  const divider = document.createElement("hr");
  divider.className = "border-t border-black/20";

  const trendingWrap = document.createElement("div");
  const trendingHeadingRow = document.createElement("div");
  trendingHeadingRow.className = "flex items-center gap-2 mb-2";
  const trendingHeading = document.createElement("h3");
  trendingHeading.className = "text-base font-semibold";
  trendingHeading.textContent = "Trending";
  trendingHeadingRow.appendChild(trendingHeading);
  trendingWrap.appendChild(trendingHeadingRow);

  // Trending filter chips: multi-select except "All Matches", which is the
  // baseline — picking any other chip clears it, and it re-activates on its
  // own once nothing else is selected, so there's always exactly one state.
  type TrendingFilter = "new" | "favorited" | "short" | "unadded";
  const TRENDING_CHIPS: { id: TrendingFilter; label: string }[] = [
    { id: "new", label: "New" },
    { id: "favorited", label: "Favorited performers" },
    { id: "short", label: "Under 30 min" },
    { id: "unadded", label: "Not in library" },
  ];
  const activeTrendingFilters = new Set<TrendingFilter>();
  const trendingChipBar = document.createElement("div");
  trendingChipBar.className = "flex gap-1.5 flex-wrap mb-3";
  trendingWrap.appendChild(trendingChipBar);

  function renderTrendingChips() {
    trendingChipBar.innerHTML = "";
    trendingChipBar.appendChild(
      renderChip("All Matches", activeTrendingFilters.size === 0, () => {
        activeTrendingFilters.clear();
        renderTrendingChips();
        trendingSection.reset();
      }),
    );
    for (const c of TRENDING_CHIPS) {
      trendingChipBar.appendChild(
        renderChip(c.label, activeTrendingFilters.has(c.id), () => {
          if (activeTrendingFilters.has(c.id)) activeTrendingFilters.delete(c.id);
          else activeTrendingFilters.add(c.id);
          renderTrendingChips();
          trendingSection.reset();
        }),
      );
    }
  }
  renderTrendingChips();

  const TRENDING_LIMIT = 100;
  const SHORT_MAX_SECONDS = 30 * 60;

  const trendingSection = renderSceneSection({
    perPage: SECTION_PER_PAGE,
    fetchPage: async (page, refresh) => {
      const isNew = activeTrendingFilters.has("new");
      const result = await api.queryScenes(
        {
          sort: "TRENDING",
          direction: "DESC",
          page,
          per_page: SECTION_PER_PAGE,
          favorites: activeTrendingFilters.has("favorited") ? "PERFORMER" : undefined,
          max_duration: activeTrendingFilters.has("short") ? SHORT_MAX_SECONDS : undefined,
          unadded: activeTrendingFilters.has("unadded") || isNew ? "1" : undefined,
          // Same definition as the card's "New" badge: not yet in the library,
          // released in the last 7 days.
          date: isNew ? new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10) : undefined,
          date_modifier: isNew ? "GREATER_THAN" : undefined,
        },
        refresh,
      );
      return { ...result, count: Math.min(result.count, TRENDING_LIMIT), approximateCount: false };
    },
    emptyMessage: "Nothing trending on StashDB right now.",
  });
  trendingHeadingRow.appendChild(renderRefreshButton(() => trendingSection.refresh()));
  trendingWrap.appendChild(trendingSection.element);

  container.appendChild(feedWrap);
  container.appendChild(divider);
  container.appendChild(trendingWrap);

  return container;
}
