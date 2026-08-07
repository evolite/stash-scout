import { api, type SavedFilter, type Scene, type SceneFilter, type SceneStatus } from "../api.js";
import { renderFilterSidebar } from "../components/FilterSidebar.js";
import { renderSavedFiltersPanel } from "../components/SavedFiltersPanel.js";
import { renderSceneCard } from "../components/SceneCard.js";
import { renderSkeletonGrid } from "../components/SkeletonGrid.js";
import { renderPagination } from "../components/Pagination.js";
import { renderExcludeTagsPanel } from "../components/ExcludeTagsPanel.js";

const PER_PAGE = 32;

const SUBTAB_BASE = "px-3 py-1.5 border-b-2";
const SUBTAB_ACTIVE = SUBTAB_BASE + " border-link text-link font-bold";
const SUBTAB_INACTIVE = SUBTAB_BASE + " border-transparent text-text hover:border-white";

function textState(message: string): HTMLElement {
  const p = document.createElement("p");
  p.className = "text-muted text-sm";
  p.textContent = message;
  return p;
}

type SubTab = "browse" | "excludes";

export function renderBrowseView(): HTMLElement {
  const container = document.createElement("div");
  container.className = "flex flex-col gap-3";

  const subTabs = document.createElement("div");
  subTabs.className = "flex gap-1 mb-1";
  container.appendChild(subTabs);

  const browsePane = document.createElement("div");
  browsePane.className = "grid gap-6 items-start grid-cols-[260px_1fr]";
  const excludesPane = document.createElement("div");
  excludesPane.style.display = "none";
  container.appendChild(browsePane);
  container.appendChild(excludesPane);

  let subTab: SubTab = "browse";
  const SUBTABS: { id: SubTab; label: string }[] = [
    { id: "browse", label: "Browse" },
    { id: "excludes", label: "Exclude Tags" },
  ];
  for (const t of SUBTABS) {
    const el = document.createElement("button");
    el.type = "button";
    el.className = t.id === subTab ? SUBTAB_ACTIVE : SUBTAB_INACTIVE;
    el.setAttribute("aria-current", t.id === subTab ? "page" : "false");
    el.textContent = t.label;
    el.addEventListener("click", () => {
      if (subTab === t.id) return;
      subTab = t.id;
      for (const other of Array.from(subTabs.children)) {
        other.className = other === el ? SUBTAB_ACTIVE : SUBTAB_INACTIVE;
        other.setAttribute("aria-current", other === el ? "page" : "false");
      }
      browsePane.style.display = subTab === "browse" ? "" : "none";
      excludesPane.style.display = subTab === "excludes" ? "" : "none";
      if (subTab === "excludes" && excludesPane.children.length === 0) {
        renderExcludeTagsPanel().then((panel) => excludesPane.appendChild(panel));
      }
    });
    subTabs.appendChild(el);
  }

  const sidebarCol = document.createElement("div");
  const contentCol = document.createElement("div");
  browsePane.appendChild(sidebarCol);
  browsePane.appendChild(contentCol);

  let filter: SceneFilter = { page: 1, per_page: PER_PAGE, sort: "DATE", direction: "DESC" };
  let statuses: Record<string, SceneStatus> = {};
  let pollTimer: ReturnType<typeof setInterval> | undefined;
  let loadedFilterId: string | null = null;
  let loadedFilterName = "";

  function renderSidebar() {
    sidebarCol.innerHTML = "";
    sidebarCol.appendChild(renderFilterSidebar(filter, applyFilter, loadedFilterName, savePreset));
    renderSavedFiltersPanel(loadSavedFilter).then((panel) => {
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
  function loadSavedFilter(saved: SavedFilter) {
    filter = { per_page: PER_PAGE, sort: "DATE", direction: "DESC", ...saved.filter, page: 1 };
    loadedFilterId = saved.id;
    loadedFilterName = saved.name;
    renderSidebar();
    load();
  }

  // Saving with a preset loaded overwrites its content and name; saving with
  // nothing loaded creates a new preset (and that preset becomes "loaded" so a
  // second Save click updates it rather than creating a duplicate).
  async function savePreset(draft: SceneFilter, name: string) {
    if (loadedFilterId) {
      await api.overwriteFilter(loadedFilterId, draft);
      await api.renameFilter(loadedFilterId, name);
      loadedFilterName = name;
    } else {
      const saved = await api.saveFilter(name, draft);
      loadedFilterId = saved.id;
      loadedFilterName = saved.name;
    }
    renderSidebar();
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
      const card = renderSceneCard(scene, statuses[scene.id], () => refreshStatuses(scenes), () => {
        scenes.splice(scenes.indexOf(scene), 1);
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
    contentCol.innerHTML = "";
    contentCol.appendChild(renderSkeletonGrid());
    try {
      const { count, scenes, approximateCount } = await api.queryScenes(filter);
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
  contentCol.appendChild(textState("Set your filters and click “Apply filters” to browse StashDB."));

  return container;
}
