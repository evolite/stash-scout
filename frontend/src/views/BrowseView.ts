import { api, type Scene, type SceneFilter, type SceneStatus } from "../api.js";
import { renderFilterSidebar } from "../components/FilterSidebar.js";
import { renderSceneCard, hidePreview } from "../components/SceneCard.js";
import { renderSkeletonGrid } from "../components/SkeletonGrid.js";
import { renderPagination } from "../components/Pagination.js";
import { emptyState } from "../components/filterControls.js";
import { isInLibraryMode, type Tab } from "../components/Navbar.js";
import { getState, getSubscriptionMode, setSubscriptionMode } from "../viewState.js";

const PER_PAGE = 32;

function textState(message: string): HTMLElement {
  const p = document.createElement("p");
  p.className = "text-muted text-sm";
  p.textContent = message;
  return p;
}

export function renderBrowseView(navigate: (tab: Tab) => void): HTMLElement {
  const container = document.createElement("div");
  container.className = "grid gap-6 items-start grid-cols-[260px_1fr]";

  const sidebarCol = document.createElement("div");
  const contentCol = document.createElement("div");
  container.appendChild(sidebarCol);
  container.appendChild(contentCol);

  // Survives render() so Back from a performer restores the applied filter.
  const st = getState<{ filter?: SceneFilter; name: string }>("browse", { name: "" });
  let filter: SceneFilter = st.filter ?? { page: 1, per_page: PER_PAGE, sort: "DATE", direction: "DESC" };
  let statuses: Record<string, SceneStatus> = {};
  let pollTimer: ReturnType<typeof setInterval> | undefined;
  let loadedFilterName = st.name;

  function renderSidebar() {
    sidebarCol.innerHTML = "";
    const { mode } = getSubscriptionMode();
    if (mode !== "none") sidebarCol.appendChild(renderBuilderBanner(mode));
    const save =
      mode === "none"
        ? undefined
        : { name: loadedFilterName, label: mode === "edit" ? "Update" : "Subscribe", onSave: commitSubscription };
    sidebarCol.appendChild(renderFilterSidebar(filter, applyFilter, save));
  }

  function renderBuilderBanner(mode: "new" | "edit"): HTMLElement {
    const banner = document.createElement("div");
    banner.className = "mb-3 rounded-lg border border-accent bg-accent-dim p-3 text-xs flex flex-col gap-2";
    const title = document.createElement("div");
    title.className = "font-semibold text-text";
    title.textContent = mode === "edit" ? `Editing "${loadedFilterName}"` : "New subscription";
    const help = document.createElement("div");
    help.className = "text-muted";
    help.textContent =
      mode === "edit"
        ? "Adjust the filters, then press Update. You can rename it too."
        : "Set the filters you want to follow, name it, then press Subscribe. New matches will show up in your Feed.";
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.className = "self-start bg-transparent border-0 p-0 text-link hover:underline";
    cancel.textContent = "Cancel";
    cancel.addEventListener("click", () => {
      setSubscriptionMode("none");
      renderSidebar();
    });
    banner.append(title, help, cancel);
    return banner;
  }

  function applyFilter(next: SceneFilter) {
    filter = { ...filter, ...next };
    load();
  }

  // Saves the drafted sidebar filter as a subscription ("new": same name
  // overwrites that one; "edit": updates the one being edited, renaming if the
  // name changed), then returns to the Subscriptions tab where it lives.
  async function commitSubscription(draft: SceneFilter, name: string) {
    const { mode, id: editId } = getSubscriptionMode();
    filter = { ...draft };
    if (mode === "edit" && editId) {
      await api.overwriteFilter(editId, draft);
      if (name !== loadedFilterName) await api.renameFilter(editId, name);
    } else {
      const existing = (await api.listFilters()).find((f) => f.name === name);
      if (existing) await api.overwriteFilter(existing.id, draft);
      const id = existing?.id ?? (await api.saveFilter(name, draft)).id;
      await api.setFilterSubscribed(id, true);
    }
    loadedFilterName = name;
    setSubscriptionMode("none");
    navigate("subscriptions");
  }

  function schedulePollingIfDownloading(scenes: Scene[]) {
    clearInterval(pollTimer);
    const anyDownloading = Object.values(statuses).some((s) => s.kind === "downloading");
    if (anyDownloading) {
      pollTimer = setInterval(() => {
        if (!container.isConnected) return clearInterval(pollTimer); // view was re-rendered away
        void refreshStatuses(scenes);
      }, 5000);
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
    st.filter = filter;
    st.name = loadedFilterName;
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
  if (st.filter) load();
  else contentCol.appendChild(emptyState("Set filters, then Apply", "Or restore a saved filter from the sidebar."));

  return container;
}
