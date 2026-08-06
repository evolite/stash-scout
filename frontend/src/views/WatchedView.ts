import { api, type Scene, type SceneStatus } from "../api.js";
import { renderSceneCard } from "../components/SceneCard.js";
import { renderSkeletonGrid } from "../components/SkeletonGrid.js";
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

// A self-contained paginated scene grid — used for both the Feed and Trending
// halves of this view, each with their own page cursor and status polling.
function renderSceneSection(opts: {
  perPage: number;
  fetchPage: (page: number) => Promise<{ count: number; scenes: Scene[]; approximateCount?: boolean }>;
  ignorable?: boolean;
  emptyMessage: string;
}): { element: HTMLElement; reset: () => void } {
  const element = document.createElement("div");
  const grid = document.createElement("div");
  grid.className = "grid gap-4 grid-cols-[repeat(auto-fill,minmax(240px,1fr))]";
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

  async function load() {
    grid.replaceChildren(...Array.from(renderSkeletonGrid(opts.perPage).children));
    const { count, scenes, approximateCount } = await opts.fetchPage(page);
    statuses = {};
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

  load();
  return { element, reset };
}

export function renderWatchedView(): HTMLElement {
  const container = document.createElement("div");
  container.className = "flex flex-col gap-3";

  let window: Window = "week";

  const feedWrap = document.createElement("div");
  const feedHeading = document.createElement("h3");
  feedHeading.className = "text-base font-semibold mb-1.5";
  feedHeading.textContent = "Watched";
  feedWrap.appendChild(feedHeading);
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

  const feedSection = renderSceneSection({
    perPage: SECTION_PER_PAGE,
    fetchPage: (page) => api.watchedFeed(page, SECTION_PER_PAGE, window),
    ignorable: true,
    emptyMessage: "Nothing here yet — watch a saved filter in Browse, or favorite performers on StashDB, to populate this feed.",
  });
  feedWrap.appendChild(feedSection.element);

  const divider = document.createElement("hr");
  divider.className = "border-t border-black/20";

  const trendingWrap = document.createElement("div");
  const trendingHeading = document.createElement("h3");
  trendingHeading.className = "text-base font-semibold mb-2";
  trendingHeading.textContent = "Trending";
  trendingWrap.appendChild(trendingHeading);

  const trendingSection = renderSceneSection({
    perPage: SECTION_PER_PAGE,
    fetchPage: (page) => api.queryScenes({ sort: "TRENDING", direction: "DESC", page, per_page: SECTION_PER_PAGE }),
    emptyMessage: "Nothing trending on StashDB right now.",
  });
  trendingWrap.appendChild(trendingSection.element);

  container.appendChild(feedWrap);
  container.appendChild(divider);
  container.appendChild(trendingWrap);

  return container;
}
