import { api, type SavedFilter } from "../api.js";
import { isInLibraryMode } from "../components/Navbar.js";
import { iconRefresh } from "../icons.js";
import { renderChip } from "../components/Chip.js";
import { renderSceneSection } from "../components/SceneSection.js";
import { getState } from "../viewState.js";

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

export function renderSubscribedView(): HTMLElement {
  const container = document.createElement("div");
  container.className = "flex flex-col gap-3";

  // Kept in viewState so Back from a performer lands on the same selections.
  const st = getState<{ window: Window; source?: string; sort: "TRENDING" | "POPULARITY" | "RANDOM"; trendingSource?: string }>(
    "subscribed",
    { window: "week", sort: "TRENDING" },
  );

  const feedWrap = document.createElement("div");
  const feedHeadingRow = document.createElement("div");
  feedHeadingRow.className = "flex items-center gap-2 mb-1.5";
  const feedHeading = document.createElement("h3");
  feedHeading.className = "text-base font-semibold";
  feedHeading.textContent = "Subscriptions";
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
    el.className = w.id === st.window ? SUBTAB_ACTIVE : SUBTAB_INACTIVE;
    el.setAttribute("aria-current", w.id === st.window ? "page" : "false");
    el.textContent = w.label;
    el.addEventListener("click", () => {
      if (st.window === w.id) return;
      st.window = w.id;
      for (const other of Array.from(subTabs.children)) {
        other.className = other === el ? SUBTAB_ACTIVE : SUBTAB_INACTIVE;
        other.setAttribute("aria-current", other === el ? "page" : "false");
      }
      feedSection.reset();
    });
    subTabs.appendChild(el);
  }
  feedWrap.appendChild(subTabs);

  // Filter-name chip bar — one chip per saved filter currently marked "subscribed"
  // (plus the always-on "Favorites" source), driven by real data from
  // /api/filters rather than hardcoded names.
  // ponytail: chips list every subscribed filter, not just ones with a match
  // right now (that needs a per-filter count query) — narrow to non-empty
  // filters later if an empty chip proves annoying in practice.
  const sourceChipBar = document.createElement("div");
  sourceChipBar.className = "flex gap-1.5 flex-wrap mb-3";
  feedWrap.appendChild(sourceChipBar);

  function renderSourceChips(names: string[]) {
    sourceChipBar.innerHTML = "";
    sourceChipBar.appendChild(
      renderChip("All matches", st.source === undefined, () => {
        st.source = undefined;
        renderSourceChips(names);
        feedSection.reset();
      }),
    );
    for (const name of names) {
      sourceChipBar.appendChild(
        renderChip(name, st.source === name, () => {
          st.source = name;
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
      const result = await api.subscribedFeed(page, SECTION_PER_PAGE, st.window, st.source, isInLibraryMode(), refresh);
      return { ...result, count: Math.min(result.count, FEED_LIMIT), approximateCount: false };
    },
    emptyMessage: "Nothing new right now.",
    stateKey: "feed",
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
  const sortToggle = document.createElement("div");
  sortToggle.className = "flex gap-1 mb-2";
  for (const s of [
    { id: "TRENDING" as const, label: "Trending" },
    { id: "POPULARITY" as const, label: "Popularity" },
    { id: "RANDOM" as const, label: "Random" },
  ]) {
    const el = document.createElement("button");
    el.type = "button";
    el.className = s.id === st.sort ? SUBTAB_ACTIVE : SUBTAB_INACTIVE;
    el.textContent = s.label;
    el.addEventListener("click", () => {
      if (st.sort === s.id) return;
      st.sort = s.id;
      for (const other of Array.from(sortToggle.children)) {
        other.className = other === el ? SUBTAB_ACTIVE : SUBTAB_INACTIVE;
      }
      trendingSection.reset();
    });
    sortToggle.appendChild(el);
  }
  trendingWrap.appendChild(sortToggle);

  // Same exclusive saved-filter chip bar as Subscriptions above — "All matches"
  // (the default) is plain unfiltered trending, exactly like before; picking a
  // specific saved filter (or "Favorites") narrows Trending's own
  // TRENDING-sorted query by that filter's tags/performers/studios/exclude_tags
  // instead of switching to the windowed subscribed feed Subscriptions uses.
  let subscribedFilters: SavedFilter[] = [];
  const trendingChipBar = document.createElement("div");
  trendingChipBar.className = "flex gap-1.5 flex-wrap mb-3";
  trendingWrap.appendChild(trendingChipBar);

  function renderTrendingChips() {
    trendingChipBar.innerHTML = "";
    trendingChipBar.appendChild(
      renderChip("All", st.trendingSource === undefined, () => {
        st.trendingSource = undefined;
        renderTrendingChips();
        trendingSection.reset();
      }),
    );
    for (const f of subscribedFilters) {
      trendingChipBar.appendChild(
        renderChip(f.name, st.trendingSource === f.name, () => {
          st.trendingSource = f.name;
          renderTrendingChips();
          trendingSection.reset();
        }),
      );
    }
    trendingChipBar.appendChild(
      renderChip("Favorites", st.trendingSource === "Favorites", () => {
        st.trendingSource = "Favorites";
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
      const chosen = subscribedFilters.find((f) => f.name === st.trendingSource);
      const cf = chosen?.filter as Record<string, unknown> | undefined;
      const filter = {
        page,
        per_page: SECTION_PER_PAGE,
        favorites: st.trendingSource === "Favorites" ? ("PERFORMER" as const) : undefined,
        unadded: isInLibraryMode() ? undefined : ("1" as const),
        tags: cf?.tags as string | undefined,
        tags_modifier: cf?.tags_modifier as "INCLUDES" | "INCLUDES_ALL" | "EXCLUDES" | undefined,
        exclude_tags: cf?.exclude_tags as string | undefined,
        performers: cf?.performers as string | undefined,
        studios: cf?.studios as string | undefined,
      };
      const result =
        st.sort === "RANDOM"
          ? await api.randomScenes(filter, refresh)
          : await api.queryScenes({ ...filter, sort: st.sort, direction: "DESC" }, refresh);
      return { ...result, count: Math.min(result.count, TRENDING_LIMIT), approximateCount: false };
    },
    emptyMessage: "Nothing to show right now.",
    stateKey: "trending",
  });
  trendingHeadingRow.appendChild(renderRefreshButton(() => trendingSection.refresh()));
  trendingWrap.appendChild(trendingSection.element);

  // Shared by both chip bars — one saved-filters lookup drives Subscriptions'
  // exclusive source picker and Trending's, keyed the same way (subscribed-flagged
  // filters + a synthetic "Favorites"/"Favorites" entry). No reload here: the
  // default "All" selection's query never depends on subscribedFilters (only a
  // named-filter chip click does, and those chips don't exist to click until
  // this resolves anyway) — reloading on arrival was a guaranteed-redundant
  // re-fetch of what trendingSection's own initial load() already got.
  api.listFilters().then((filters) => {
    subscribedFilters = filters.filter((f) => f.subscribed);
    const names = subscribedFilters.map((f) => f.name);
    names.push("Favorites");
    renderSourceChips(names);
    renderTrendingChips();
  });

  container.appendChild(trendingWrap);
  container.appendChild(divider);
  container.appendChild(feedWrap);

  return container;
}
