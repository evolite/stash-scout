import { api, type Scene, type SceneStatus } from "../api.js";
import { renderSceneCard } from "../components/SceneCard.js";
import { renderPagination } from "../components/Pagination.js";

const SECTION_PER_PAGE = 16;

type Window = "week" | "month" | "year";
const WINDOWS: { id: Window; label: string }[] = [
  { id: "week", label: "Last Week" },
  { id: "month", label: "Last Month" },
  { id: "year", label: "Last Year" },
];

const SUBTAB_BASE = "px-3 py-1.5 border-b-2";
const SUBTAB_ACTIVE = SUBTAB_BASE + " border-link text-link font-bold";
const SUBTAB_INACTIVE = SUBTAB_BASE + " border-transparent text-text hover:border-white";

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
  ignorable?: boolean;
  emptyMessage: string;
}): { element: HTMLElement; reset: () => void; refresh: () => Promise<void> } {
  const element = document.createElement("div");
  const grid = document.createElement("div");
  grid.className = "grid gap-4 grid-cols-[repeat(auto-fill,minmax(240px,1fr))] transition-opacity duration-150";
  const paginationEl = document.createElement("div");
  element.appendChild(grid);
  element.appendChild(paginationEl);

  let page = 1;
  let statuses: Record<string, SceneStatus> = {};

  function renderGrid(scenes: Scene[]) {
    grid.innerHTML = "";
    for (const scene of scenes) {
      const card = renderSceneCard(scene, statuses[scene.id], () => refreshStatuses(scenes), opts.ignorable ? () => card.remove() : undefined);
      grid.appendChild(card);
    }
  }

  async function refreshStatuses(scenes: Scene[]) {
    statuses = await api.sceneStatuses(scenes.map((s) => s.id));
    renderGrid(scenes);
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
    grid.classList.remove("opacity-40", "pointer-events-none");

    if (scenes.length === 0 && page === 1) {
      grid.innerHTML = "";
      grid.appendChild(textState(opts.emptyMessage));
      paginationEl.innerHTML = "";
      return;
    }
    updatePagination(count, !!approximateCount);
    renderGrid(scenes);
    refreshStatuses(scenes);
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

  const feedWrap = document.createElement("div");
  const feedHeadingRow = document.createElement("div");
  feedHeadingRow.className = "flex items-center gap-2 mb-1.5";
  const feedHeading = document.createElement("h3");
  feedHeading.className = "text-base font-semibold";
  feedHeading.textContent = "Watched";
  feedHeadingRow.appendChild(feedHeading);
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

  const FEED_LIMIT = 100;

  const feedSection = renderSceneSection({
    perPage: SECTION_PER_PAGE,
    fetchPage: async (page, refresh) => {
      const result = await api.watchedFeed(page, SECTION_PER_PAGE, window, refresh);
      return { ...result, count: Math.min(result.count, FEED_LIMIT), approximateCount: false };
    },
    ignorable: true,
    emptyMessage: "Nothing here yet — watch a saved filter in Browse, or favorite performers on StashDB, to populate this feed.",
  });
  feedHeadingRow.appendChild(renderRefreshButton(() => feedSection.refresh()));
  feedWrap.appendChild(feedSection.element);

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

  const TRENDING_LIMIT = 100;

  const trendingSection = renderSceneSection({
    perPage: SECTION_PER_PAGE,
    fetchPage: async (page, refresh) => {
      const result = await api.queryScenes({ sort: "TRENDING", direction: "DESC", page, per_page: SECTION_PER_PAGE }, refresh);
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
