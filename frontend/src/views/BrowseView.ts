import { api, type SavedFilter, type Scene, type SceneFilter, type SceneStatus } from "../api.js";
import { renderFilterSidebar } from "../components/FilterSidebar.js";
import { renderSavedFiltersPanel } from "../components/SavedFiltersPanel.js";
import { renderSceneCard, hidePreview } from "../components/SceneCard.js";
import { renderSkeletonGrid } from "../components/SkeletonGrid.js";
import { renderPagination } from "../components/Pagination.js";
import { emptyState } from "../components/filterControls.js";
import { isInLibraryMode } from "../components/Navbar.js";

const PER_PAGE = 32;

function textState(message: string): HTMLElement {
  const p = document.createElement("p");
  p.className = "text-muted text-sm";
  p.textContent = message;
  return p;
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
  let loadedFilterName = "";

  function renderSidebar() {
    sidebarCol.innerHTML = "";
    const savedHost = document.createElement("div");
    sidebarCol.appendChild(renderFilterSidebar(filter, applyFilter, loadedFilterName, savePreset, savedHost));
    renderSavedFiltersPanel(savedHost, loadSavedFilter);
  }

  function applyFilter(next: SceneFilter) {
    filter = { ...filter, ...next };
    load();
  }

  // Loading a preset replaces the filter outright (rather than merging onto
  // whatever's currently drafted) and re-renders the sidebar so its fields show
  // the loaded values and can be tweaked from there.
  function loadSavedFilter(saved: SavedFilter) {
    filter = { per_page: PER_PAGE, sort: "DATE", direction: "DESC", ...saved.filter, page: 1 };
    loadedFilterName = saved.name;
    renderSidebar();
    load();
  }

  // Matched by name, not by what's currently loaded — saving under a name
  // that already exists overwrites that preset's content; any other name
  // creates a new one. So editing a loaded preset and changing its name
  // before saving forks it into a new preset instead of renaming the
  // original, and saving under an existing name overwrites it even if
  // nothing was loaded first.
  async function savePreset(draft: SceneFilter, name: string) {
    // Commit the drafted sidebar values as the live filter first — otherwise
    // the renderSidebar() below rebuilds from the stale `filter` and the just-
    // saved edits vanish from the UI (and a second Save would then persist the
    // stale values back over the good save).
    filter = { ...draft };
    const existing = (await api.listFilters()).find((f) => f.name === name);
    if (existing) {
      await api.overwriteFilter(existing.id, draft);
      loadedFilterName = existing.name;
    } else {
      const saved = await api.saveFilter(name, draft);
      loadedFilterName = saved.name;
    }
    renderSidebar();
    load();
  }

  function schedulePollingIfDownloading(scenes: Scene[]) {
    clearInterval(pollTimer);
    const anyDownloading = Object.values(statuses).some((s) => s.kind === "downloading");
    if (anyDownloading) {
      pollTimer = setInterval(() => refreshStatuses(scenes), 5000);
    }
  }

  async function refreshStatuses(scenes: Scene[]) {
    statuses = await api.sceneStatuses(scenes.map((s) => s.id));
    renderGrid(scenes);
    schedulePollingIfDownloading(scenes);
  }

  // A card action only needs its own scene's status re-checked, not every
  // visible card's — re-running the full batch on every click was fanning out
  // to up to 2 sequential local Stash lookups per scene on the whole page.
  async function refreshOneStatus(id: string, scenes: Scene[]) {
    const result = await api.sceneStatuses([id]);
    statuses = { ...statuses, ...result };
    renderGrid(scenes);
    schedulePollingIfDownloading(scenes);
  }

  function renderGrid(scenes: Scene[]) {
    const grid = contentCol.querySelector(".SceneGrid");
    if (!grid) return;
    hidePreview();
    grid.innerHTML = "";
    for (const scene of scenes) {
      const card = renderSceneCard(scene, statuses[scene.id], () => refreshOneStatus(scene.id, scenes), () => {
        scenes.splice(scenes.indexOf(scene), 1);
        hidePreview();
        card.remove();
      });
      grid.appendChild(card);
    }
  }

  function buildPagination(count: number, approximate: boolean): HTMLElement {
    return renderPagination({
      page: filter.page ?? 1,
      perPage: filter.per_page ?? PER_PAGE,
      count,
      approximate,
      onPage: (page) => applyFilter({ page }),
    });
  }

  async function load() {
    clearInterval(pollTimer);
    hidePreview();
    contentCol.innerHTML = "";
    contentCol.appendChild(renderSkeletonGrid());
    try {
      const { count, scenes, approximateCount } = await api.queryScenes({ ...filter, unadded: isInLibraryMode() ? undefined : "1" });
      statuses = {};
      contentCol.innerHTML = "";
      const grid = document.createElement("div");
      grid.className = "SceneGrid grid gap-4 grid-cols-[repeat(auto-fill,minmax(240px,1fr))]";
      contentCol.appendChild(grid);
      contentCol.appendChild(buildPagination(count, !!approximateCount));
      renderGrid(scenes);
      refreshStatuses(scenes);
    } catch (err) {
      contentCol.innerHTML = "";
      contentCol.appendChild(textState(`Failed to load scenes: ${(err as Error).message}`));
    }
  }

  renderSidebar();
  contentCol.appendChild(emptyState("Set filters, then Apply", "Or restore a saved filter from the sidebar."));

  return container;
}
