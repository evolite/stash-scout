import { api, type SavedFilter, type SceneFilter } from "../api.js";
import { isInLibraryMode } from "../components/Navbar.js";
import { renderChip } from "../components/Chip.js";
import { renderSceneSection } from "../components/SceneSection.js";
import { renderPerformerSearch } from "../components/PerformerSearch.js";

const PER_PAGE = 32;

// Same "merge a chosen watched filter's tags/studio/exclude_tags into one flat
// query" trick WatchedView's Trending section uses (see WatchedView.ts's
// trendingSection.fetchPage) — here `performers` is pinned to the performer
// being browsed instead of `favorites`. Global exclude tags are applied
// server-side unconditionally (server/routes/scenes.ts), so nothing extra is
// needed here for that.
export function renderPerformersView(initialId?: string): HTMLElement {
  const container = document.createElement("div");
  container.className = "flex flex-col gap-3";

  const searchRow = document.createElement("div");
  container.appendChild(searchRow);

  const header = document.createElement("div");
  header.className = "flex items-center gap-3";
  container.appendChild(header);

  const chipBar = document.createElement("div");
  chipBar.className = "flex gap-1.5 flex-wrap";
  container.appendChild(chipBar);

  const sectionWrap = document.createElement("div");
  container.appendChild(sectionWrap);

  let performerId: string | undefined = initialId;
  let performerName: string | undefined;
  let selectedFilterName: string | undefined; // undefined = "All"
  let watchedFilters: SavedFilter[] = [];
  let section: ReturnType<typeof renderSceneSection> | undefined;

  function renderHeader() {
    header.innerHTML = "";
    if (!performerId) return;
    const name = document.createElement("h3");
    name.className = "text-base font-semibold";
    name.textContent = performerName ?? performerId;
    header.appendChild(name);
    const link = document.createElement("a");
    link.href = `https://stashdb.org/performers/${performerId}`;
    link.target = "_blank";
    link.className = "text-muted text-xs hover:text-link";
    link.textContent = "View on StashDB";
    header.appendChild(link);
  }

  function renderChips() {
    chipBar.innerHTML = "";
    chipBar.appendChild(
      renderChip("All", selectedFilterName === undefined, () => {
        selectedFilterName = undefined;
        renderChips();
        section?.reset();
      }),
    );
    for (const f of watchedFilters) {
      chipBar.appendChild(
        renderChip(f.name, selectedFilterName === f.name, () => {
          selectedFilterName = f.name;
          renderChips();
          section?.reset();
        }),
      );
    }
  }

  function mountSection() {
    sectionWrap.innerHTML = "";
    section = renderSceneSection({
      perPage: PER_PAGE,
      fetchPage: async (page, refresh) => {
        const chosen = watchedFilters.find((f) => f.name === selectedFilterName);
        const cf = chosen?.filter as Record<string, unknown> | undefined;
        const filter: SceneFilter = {
          page,
          per_page: PER_PAGE,
          performers: performerId,
          unadded: isInLibraryMode() ? undefined : "1",
          tags: cf?.tags as string | undefined,
          tags_modifier: cf?.tags_modifier as SceneFilter["tags_modifier"],
          exclude_tags: cf?.exclude_tags as string | undefined,
          studios: cf?.studios as string | undefined,
          sort: "DATE",
          direction: "DESC",
        };
        return api.queryScenes(filter, refresh);
      },
      emptyMessage: "No scenes found for this performer.",
    });
    sectionWrap.appendChild(section.element);
  }

  // Selecting a different performer (via the search box, or a scene card's
  // performer link elsewhere in the app calling navigateToPerformer) is a
  // plain in-app state update and re-render — no URL/history involvement,
  // same as every other view in this app.
  function loadPerformer(id: string, name?: string) {
    performerId = id;
    performerName = name;
    renderHeader();
    if (!name) {
      api.performersByIds([id]).then((found) => {
        performerName = found[0]?.name;
        renderHeader();
      });
    }
    mountSection();
  }

  searchRow.appendChild(renderPerformerSearch((id, name) => loadPerformer(id, name)));

  api.listFilters().then((filters) => {
    watchedFilters = filters.filter((f) => f.watched);
    renderChips();
  });

  if (performerId) {
    loadPerformer(performerId);
  } else {
    const hint = document.createElement("p");
    hint.className = "text-muted text-sm";
    hint.textContent = "Search for a performer to browse their scenes.";
    sectionWrap.appendChild(hint);
  }

  return container;
}
