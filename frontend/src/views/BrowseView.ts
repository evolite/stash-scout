import { api, type Scene, type SceneFilter, type SceneStatus } from "../api.js";
import { renderFilterSidebar } from "../components/FilterSidebar.js";
import { renderSavedFiltersPanel } from "../components/SavedFiltersPanel.js";
import { renderSceneCard } from "../components/SceneCard.js";
import { renderSkeletonGrid } from "../components/SkeletonGrid.js";

const PER_PAGE = 25;

function textState(message: string): HTMLElement {
  const p = document.createElement("p");
  p.className = "text-muted text-sm";
  p.textContent = message;
  return p;
}

function paginationBtnClass(): string {
  return "bg-secondary text-white border-0 px-2.5 py-1.5 rounded hover:bg-surface-hover disabled:opacity-50 disabled:cursor-default";
}

export function renderBrowseView(): HTMLElement {
  const container = document.createElement("div");
  container.className = "grid gap-6 items-start grid-cols-[260px_1fr]";

  const sidebarCol = document.createElement("div");
  const contentCol = document.createElement("div");
  container.appendChild(sidebarCol);
  container.appendChild(contentCol);

  let filter: SceneFilter = { page: 1, per_page: PER_PAGE, sort: "DATE", direction: "DESC" };
  let statuses: Record<string, SceneStatus> = {};
  let pollTimer: ReturnType<typeof setInterval> | undefined;

  function renderSidebar() {
    sidebarCol.innerHTML = "";
    sidebarCol.appendChild(renderFilterSidebar(filter, applyFilter));
    renderSavedFiltersPanel(() => filter, loadSavedFilter).then((panel) => {
      sidebarCol.appendChild(panel);
    });
  }

  function applyFilter(next: SceneFilter) {
    filter = { ...filter, ...next };
    load();
  }

  // Loading a preset replaces the filter outright (rather than merging onto
  // whatever's currently drafted) and re-renders the sidebar so its fields show
  // the loaded values and can be tweaked from there.
  function loadSavedFilter(loaded: SceneFilter) {
    filter = { per_page: PER_PAGE, sort: "DATE", direction: "DESC", ...loaded, page: 1 };
    renderSidebar();
    load();
  }

  async function refreshStatuses(scenes: Scene[]) {
    statuses = await api.sceneStatuses(scenes.map((s) => s.id));
    renderGrid(scenes);

    clearInterval(pollTimer);
    const anyDownloading = Object.values(statuses).some((s) => s.kind === "downloading");
    if (anyDownloading) {
      pollTimer = setInterval(() => refreshStatuses(scenes), 5000);
    }
  }

  function renderGrid(scenes: Scene[]) {
    const grid = contentCol.querySelector(".SceneGrid");
    if (!grid) return;
    grid.innerHTML = "";
    for (const scene of scenes) {
      grid.appendChild(
        renderSceneCard(scene, statuses[scene.id], () => refreshStatuses(scenes)),
      );
    }
  }

  function renderPagination(count: number, approximate: boolean, sceneCountOnPage: number) {
    const totalPages = Math.max(1, Math.ceil(count / (filter.per_page ?? PER_PAGE)));
    const page = filter.page ?? 1;
    const pag = document.createElement("div");
    pag.className = "flex gap-1 my-4";

    const prev = document.createElement("button");
    prev.className = paginationBtnClass();
    prev.textContent = "Prev";
    prev.disabled = page <= 1;
    prev.addEventListener("click", () => applyFilter({ page: page - 1 }));
    pag.appendChild(prev);

    const label = document.createElement("span");
    label.className = "px-2 py-1.5";
    label.textContent = `Page ${page}${approximate ? "" : ` / ${totalPages}`} (${approximate ? "~" : ""}${count} scenes)`;
    pag.appendChild(label);

    const next = document.createElement("button");
    next.className = paginationBtnClass();
    next.textContent = "Next";
    next.disabled = approximate ? sceneCountOnPage < (filter.per_page ?? PER_PAGE) : page >= totalPages;
    next.addEventListener("click", () => applyFilter({ page: page + 1 }));
    pag.appendChild(next);

    return pag;
  }

  async function load() {
    clearInterval(pollTimer);
    contentCol.innerHTML = "";
    contentCol.appendChild(renderSkeletonGrid());
    try {
      const { count, scenes, approximateCount } = await api.queryScenes(filter);
      statuses = {};
      contentCol.innerHTML = "";
      contentCol.appendChild(renderPagination(count, !!approximateCount, scenes.length));
      const grid = document.createElement("div");
      grid.className = "SceneGrid grid gap-4 grid-cols-[repeat(auto-fill,minmax(240px,1fr))]";
      contentCol.appendChild(grid);
      contentCol.appendChild(renderPagination(count, !!approximateCount, scenes.length));
      renderGrid(scenes);
      refreshStatuses(scenes);
    } catch (err) {
      contentCol.innerHTML = "";
      contentCol.appendChild(textState(`Failed to load scenes: ${(err as Error).message}`));
    }
  }

  renderSidebar();
  contentCol.appendChild(textState("Set your filters and click “Apply filters” to browse StashDB."));

  return container;
}
