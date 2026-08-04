import { api, type Scene, type SceneFilter, type SceneStatus } from "../api.js";
import { renderFilterSidebar } from "../components/FilterSidebar.js";
import { renderSavedFiltersPanel } from "../components/SavedFiltersPanel.js";
import { renderSceneCard } from "../components/SceneCard.js";

const PER_PAGE = 25;

export function renderBrowseView(): HTMLElement {
  const container = document.createElement("div");
  container.className = "BrowseLayout";

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
    pag.className = "Pagination";

    const prev = document.createElement("button");
    prev.textContent = "Prev";
    prev.disabled = page <= 1;
    prev.addEventListener("click", () => applyFilter({ page: page - 1 }));
    pag.appendChild(prev);

    const label = document.createElement("span");
    label.style.padding = "0.35rem 0.5rem";
    label.textContent = `Page ${page}${approximate ? "" : ` / ${totalPages}`} (${approximate ? "~" : ""}${count} scenes)`;
    pag.appendChild(label);

    const next = document.createElement("button");
    next.textContent = "Next";
    next.disabled = approximate ? sceneCountOnPage < (filter.per_page ?? PER_PAGE) : page >= totalPages;
    next.addEventListener("click", () => applyFilter({ page: page + 1 }));
    pag.appendChild(next);

    return pag;
  }

  async function load() {
    clearInterval(pollTimer);
    contentCol.innerHTML = "<p>Loading scenes…</p>";
    try {
      const { count, scenes, approximateCount } = await api.queryScenes(filter);
      statuses = {};
      contentCol.innerHTML = "";
      contentCol.appendChild(renderPagination(count, !!approximateCount, scenes.length));
      const grid = document.createElement("div");
      grid.className = "SceneGrid";
      contentCol.appendChild(grid);
      contentCol.appendChild(renderPagination(count, !!approximateCount, scenes.length));
      renderGrid(scenes);
      refreshStatuses(scenes);
    } catch (err) {
      contentCol.innerHTML = `<p>Failed to load scenes: ${(err as Error).message}</p>`;
    }
  }

  renderSidebar();
  load();

  return container;
}
