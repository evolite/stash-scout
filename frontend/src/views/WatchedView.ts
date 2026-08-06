import { api, type Scene, type SceneStatus } from "../api.js";
import { renderSceneCard } from "../components/SceneCard.js";
import { renderSkeletonGrid } from "../components/SkeletonGrid.js";

function paginationBtnClass(): string {
  return "bg-secondary text-white border-0 px-2.5 py-1.5 rounded hover:bg-surface-hover disabled:opacity-50 disabled:cursor-default";
}

const PER_PAGE = 25;

type Window = "week" | "month" | "year";
const WINDOWS: { id: Window; label: string }[] = [
  { id: "week", label: "Last Week" },
  { id: "month", label: "Last Month" },
  { id: "year", label: "Last Year" },
];

const SUBTAB_BASE = "px-3 py-1.5 border-b-2";
const SUBTAB_ACTIVE = SUBTAB_BASE + " border-link text-link font-bold";
const SUBTAB_INACTIVE = SUBTAB_BASE + " border-transparent text-text hover:border-white";

function emptyState(message: string, goToBrowse: () => void, buttonLabel: string): HTMLElement {
  const wrap = document.createElement("div");
  wrap.className = "text-center py-12 px-4 text-muted";
  const p = document.createElement("p");
  p.textContent = message;
  wrap.appendChild(p);
  const btn = document.createElement("button");
  btn.className = "bg-accent text-white rounded px-3 py-1.5 hover:brightness-110";
  btn.textContent = buttonLabel;
  btn.addEventListener("click", goToBrowse);
  wrap.appendChild(btn);
  return wrap;
}

export function renderWatchedView(goToBrowse: () => void): HTMLElement {
  const container = document.createElement("div");
  container.appendChild(renderSkeletonGrid());

  let page = 1;
  let window: Window = "week";

  async function render() {
    const filters = await api.listFilters();
    if (filters.length === 0) {
      container.innerHTML = "";
      container.appendChild(emptyState("You haven't saved any filters yet.", goToBrowse, "Create Your First Filter"));
      return;
    }
    if (!filters.some((f) => f.watched)) {
      container.innerHTML = "";
      container.appendChild(
        emptyState(
          "No saved filters are watched yet — check the box next to a filter in Browse to add it here.",
          goToBrowse,
          "Go to Browse",
        ),
      );
      return;
    }

    container.innerHTML = "";
    const subTabs = document.createElement("div");
    subTabs.className = "flex gap-1 mb-3";
    for (const w of WINDOWS) {
      const el = document.createElement("button");
      el.type = "button";
      el.className = w.id === window ? SUBTAB_ACTIVE : SUBTAB_INACTIVE;
      el.setAttribute("aria-current", w.id === window ? "page" : "false");
      el.textContent = w.label;
      el.addEventListener("click", () => {
        if (window === w.id) return;
        window = w.id;
        page = 1;
        render();
      });
      subTabs.appendChild(el);
    }
    const grid = document.createElement("div");
    grid.className = "grid gap-4 grid-cols-[repeat(auto-fill,minmax(240px,1fr))]";
    const paginationTop = document.createElement("div");
    const paginationBottom = document.createElement("div");
    container.appendChild(subTabs);
    container.appendChild(paginationTop);
    container.appendChild(grid);
    container.appendChild(paginationBottom);

    let statuses: Record<string, SceneStatus> = {};

    async function refreshStatuses(scenes: Scene[]) {
      statuses = await api.sceneStatuses(scenes.map((s) => s.id));
      renderGrid(scenes);
    }

    function renderGrid(scenes: Scene[]) {
      grid.innerHTML = "";
      for (const scene of scenes) {
        const card = renderSceneCard(scene, statuses[scene.id], () => refreshStatuses(scenes), () => card.remove());
        grid.appendChild(card);
      }
    }

    function renderPagination(target: HTMLElement, count: number, approximate: boolean, sceneCountOnPage: number) {
      target.innerHTML = "";
      const totalPages = Math.max(1, Math.ceil(count / PER_PAGE));
      const pag = document.createElement("div");
      pag.className = "flex gap-1 my-4";

      const prev = document.createElement("button");
      prev.className = paginationBtnClass();
      prev.textContent = "Prev";
      prev.disabled = page <= 1;
      prev.addEventListener("click", () => {
        page -= 1;
        loadFeed();
      });
      pag.appendChild(prev);

      const label = document.createElement("span");
      label.className = "px-2 py-1.5";
      label.textContent = `Page ${page}${approximate ? "" : ` / ${totalPages}`} (${approximate ? "~" : ""}${count} scenes)`;
      pag.appendChild(label);

      const next = document.createElement("button");
      next.className = paginationBtnClass();
      next.textContent = "Next";
      next.disabled = approximate ? sceneCountOnPage < PER_PAGE : page >= totalPages;
      next.addEventListener("click", () => {
        page += 1;
        loadFeed();
      });
      pag.appendChild(next);

      target.appendChild(pag);
    }

    async function loadFeed() {
      grid.replaceChildren(...Array.from(renderSkeletonGrid().children));
      const { count, scenes, approximateCount } = await api.watchedFeed(page, PER_PAGE, window);
      statuses = {};
      renderPagination(paginationTop, count, !!approximateCount, scenes.length);
      renderPagination(paginationBottom, count, !!approximateCount, scenes.length);
      renderGrid(scenes);
      refreshStatuses(scenes);
    }

    loadFeed();
  }

  render();
  return container;
}
