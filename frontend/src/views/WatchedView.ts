import { api, type Scene, type SceneStatus, type SavedFilter } from "../api.js";
import { renderSceneCard, hidePreview } from "../components/SceneCard.js";
import { renderPagination } from "../components/Pagination.js";
import { isInLibraryMode } from "../components/Navbar.js";
import { iconCheckCircle, iconRefresh } from "../icons.js";

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

const CHIP_BASE = "px-3 py-1.5 rounded border text-xs cursor-pointer transition-colors duration-150";
const CHIP_ACTIVE = CHIP_BASE + " border-accent bg-accent-dim text-text";
const CHIP_INACTIVE = CHIP_BASE + " border-line bg-surface text-muted hover:text-text";

function renderChip(label: string, active: boolean, onClick: () => void): HTMLButtonElement {
  const chip = document.createElement("button");
  chip.type = "button";
  chip.className = active ? CHIP_ACTIVE : CHIP_INACTIVE;
  chip.textContent = label;
  chip.addEventListener("click", onClick);
  return chip;
}

function textState(message: string): HTMLElement {
  const wrap = document.createElement("div");
  wrap.className = "col-span-full flex items-center justify-center py-12 text-text-faint";
  wrap.title = message;
  wrap.appendChild(iconCheckCircle());
  return wrap;
}

function renderRefreshButton(onClick: () => Promise<void>): HTMLElement {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "flex items-center justify-center text-muted hover:text-link disabled:opacity-50";
  btn.title = "Refresh";
  const icon = iconRefresh();
  btn.appendChild(icon);
  btn.addEventListener("click", async () => {
    btn.disabled = true;
    icon.classList.add("animate-spin");
    try {
      await onClick();
    } finally {
      icon.classList.remove("animate-spin");
      btn.disabled = false;
    }
  });
  return btn;
}

// Only shown on a section's very first load, when there's no prior content to
// keep on screen — a small centered spinner instead of placeholder cards that
// just get thrown away once real data lands.
function renderSpinnerIcon(): HTMLElement {
  const spinner = document.createElement("div");
  spinner.className = "w-6 h-6 rounded-full border-2 border-muted/30 border-t-accent animate-spin";
  return spinner;
}

function renderSpinner(): HTMLElement {
  const wrap = document.createElement("div");
  wrap.className = "col-span-full flex items-center justify-center py-12";
  wrap.appendChild(renderSpinnerIcon());
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
  grid.className = "grid gap-4 grid-cols-[repeat(auto-fill,minmax(240px,1fr))]";
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
    hidePreview();
    grid.innerHTML = "";
    for (const scene of currentScenes) {
      const card = renderSceneCard(scene, statuses[scene.id], () => refreshOneStatus(scene.id), () => {
        currentScenes = currentScenes.filter((s) => s.id !== scene.id);
        card.remove();
      });
      grid.appendChild(card);
    }
  }

  // A card action (Add/Monitor/Unmonitor) only needs its own scene's status
  // re-checked, not a full re-fetch of every visible card's status — that
  // full-page-wide `sceneStatuses` call fans out to up to 2 sequential local
  // Stash lookups per scene, and re-running it on every single click was what
  // made "adding something" feel slow (16 cards' worth of lookups per click).
  async function refreshOneStatus(id: string) {
    const result = await api.sceneStatuses([id]);
    statuses = { ...statuses, ...result };
    renderGrid();
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
  // just breathing (a slow pulse), instead of tearing them out for
  // placeholders that would only get thrown away a moment later once the
  // real results land. The try/finally is load-bearing — without it, a
  // failed fetch (a transient StashDB error, say) leaves the grid pulsing
  // forever with no way to clear it.
  async function load(bypassCache = false) {
    const isFirstLoad = grid.children.length === 0;
    if (isFirstLoad) {
      grid.replaceChildren(renderSpinner());
    } else {
      grid.classList.add("animate-breathe", "pointer-events-none");
    }

    try {
      const { count, scenes, approximateCount } = await opts.fetchPage(page, bypassCache);
      statuses = {};
      currentScenes = scenes;

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
    } finally {
      grid.classList.remove("animate-breathe", "pointer-events-none");
    }
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
  pendingBadge.className = "rounded bg-accent-dim text-accent text-[11px] font-bold px-2 py-0.5";
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
      const result = await api.watchedFeed(page, SECTION_PER_PAGE, window, selectedSource, isInLibraryMode(), refresh);
      return { ...result, count: Math.min(result.count, FEED_LIMIT), approximateCount: false };
    },
    emptyMessage: "Nothing new right now.",
    onCount: (count) => {
      pendingBadge.hidden = count === 0;
      pendingBadge.textContent = `${count} pending`;
    },
  });
  feedHeadingRow.appendChild(renderRefreshButton(() => feedSection.refresh()));
  feedWrap.appendChild(feedSection.element);

  const divider = document.createElement("hr");
  divider.className = "border-t border-black/20";

  const trendingWrap = document.createElement("div");
  const trendingHeadingRow = document.createElement("div");
  trendingHeadingRow.className = "flex items-center gap-2 mb-1.5";
  const trendingHeading = document.createElement("h3");
  trendingHeading.className = "text-base font-semibold";
  trendingHeading.textContent = "Charts";
  trendingHeadingRow.appendChild(trendingHeading);
  trendingWrap.appendChild(trendingHeadingRow);

  // "Trending" is StashDB's own recency-weighted activity score; "Popularity"
  // is a plain all-time favorites/o-counter ranking; "Random" picks a random
  // ~2-month slice of StashDB's history (server-side — see
  // queryScenesRandomWindow) instead of sorting by either. Same section and
  // chip bar below either way, just a different query.
  type TrendingSort = "TRENDING" | "POPULARITY" | "RANDOM";
  let trendingSort: TrendingSort = "TRENDING";
  const sortToggle = document.createElement("div");
  sortToggle.className = "flex gap-1 mb-2";
  for (const s of [
    { id: "TRENDING" as const, label: "Trending" },
    { id: "POPULARITY" as const, label: "Popularity" },
    { id: "RANDOM" as const, label: "Random" },
  ]) {
    const el = document.createElement("button");
    el.type = "button";
    el.className = s.id === trendingSort ? SUBTAB_ACTIVE : SUBTAB_INACTIVE;
    el.textContent = s.label;
    el.addEventListener("click", () => {
      if (trendingSort === s.id) return;
      trendingSort = s.id;
      for (const other of Array.from(sortToggle.children)) {
        other.className = other === el ? SUBTAB_ACTIVE : SUBTAB_INACTIVE;
      }
      trendingSection.reset();
    });
    sortToggle.appendChild(el);
  }
  trendingWrap.appendChild(sortToggle);

  // Same exclusive saved-filter chip bar as New Releases above — "All matches"
  // (the default) is plain unfiltered trending, exactly like before; picking a
  // specific saved filter (or "Favorites") narrows Trending's own
  // TRENDING-sorted query by that filter's tags/performers/studios/exclude_tags
  // instead of switching to the windowed watched feed New Releases uses.
  let selectedTrendingSource: string | undefined; // undefined = "All matches"
  let watchedFilters: SavedFilter[] = [];
  const trendingChipBar = document.createElement("div");
  trendingChipBar.className = "flex gap-1.5 flex-wrap mb-3";
  trendingWrap.appendChild(trendingChipBar);

  function renderTrendingChips() {
    trendingChipBar.innerHTML = "";
    trendingChipBar.appendChild(
      renderChip("All", selectedTrendingSource === undefined, () => {
        selectedTrendingSource = undefined;
        renderTrendingChips();
        trendingSection.reset();
      }),
    );
    for (const f of watchedFilters) {
      trendingChipBar.appendChild(
        renderChip(f.name, selectedTrendingSource === f.name, () => {
          selectedTrendingSource = f.name;
          renderTrendingChips();
          trendingSection.reset();
        }),
      );
    }
    trendingChipBar.appendChild(
      renderChip("Favorites", selectedTrendingSource === "Favorites", () => {
        selectedTrendingSource = "Favorites";
        renderTrendingChips();
        trendingSection.reset();
      }),
    );
  }
  renderTrendingChips();

  const TRENDING_LIMIT = 100;

  const trendingSection = renderSceneSection({
    perPage: SECTION_PER_PAGE,
    fetchPage: async (page, refresh) => {
      const chosen = watchedFilters.find((f) => f.name === selectedTrendingSource);
      const cf = chosen?.filter as Record<string, unknown> | undefined;
      const filter = {
        page,
        per_page: SECTION_PER_PAGE,
        favorites: selectedTrendingSource === "Favorites" ? ("PERFORMER" as const) : undefined,
        unadded: isInLibraryMode() ? undefined : ("1" as const),
        tags: cf?.tags as string | undefined,
        tags_modifier: cf?.tags_modifier as "INCLUDES" | "INCLUDES_ALL" | "EXCLUDES" | undefined,
        exclude_tags: cf?.exclude_tags as string | undefined,
        performers: cf?.performers as string | undefined,
        studios: cf?.studios as string | undefined,
      };
      const result =
        trendingSort === "RANDOM"
          ? await api.randomScenes(filter, refresh)
          : await api.queryScenes({ ...filter, sort: trendingSort, direction: "DESC" }, refresh);
      return { ...result, count: Math.min(result.count, TRENDING_LIMIT), approximateCount: false };
    },
    emptyMessage: "Nothing to show right now.",
  });
  trendingHeadingRow.appendChild(renderRefreshButton(() => trendingSection.refresh()));
  trendingWrap.appendChild(trendingSection.element);

  // Shared by both chip bars — one saved-filters lookup drives New Releases'
  // exclusive source picker and Trending's, keyed the same way (watched-flagged
  // filters + a synthetic "Favorites"/"Favorites" entry). No reload here: the
  // default "All" selection's query never depends on watchedFilters (only a
  // named-filter chip click does, and those chips don't exist to click until
  // this resolves anyway) — reloading on arrival was a guaranteed-redundant
  // re-fetch of what trendingSection's own initial load() already got.
  api.listFilters().then((filters) => {
    watchedFilters = filters.filter((f) => f.watched);
    const names = watchedFilters.map((f) => f.name);
    names.push("Favorites");
    renderSourceChips(names);
    renderTrendingChips();
  });

  container.appendChild(trendingWrap);
  container.appendChild(divider);
  container.appendChild(feedWrap);

  return container;
}
