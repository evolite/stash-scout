import { api, type SavedFilter } from "../api.js";
import { isInLibraryMode } from "../components/Navbar.js";
import { iconRefresh } from "../icons.js";
import { renderChip } from "../components/Chip.js";
import { renderSceneSection } from "../components/SceneSection.js";

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
