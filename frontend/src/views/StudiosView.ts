import { api, type SavedFilter, type SceneFilter } from "../api.js";
import { isInLibraryMode } from "../components/Navbar.js";
import { renderChip } from "../components/Chip.js";
import { renderSceneSection } from "../components/SceneSection.js";
import { renderStudioSearch } from "../components/StudioSearch.js";
import { renderStudioHeader } from "../components/EntityHeader.js";

const PER_PAGE = 32;

// Mirror of PerformersView: browse one studio's StashDB scenes, optionally
// narrowed by a chosen watched filter's tags/exclude_tags. The browsed studio
// is pinned as the `studios` criterion. Global exclude tags are applied
// server-side unconditionally (server/routes/scenes.ts).
export function renderStudiosView(initialId?: string): HTMLElement {
  const container = document.createElement("div");
  container.className = "flex flex-col gap-4";

  const searchRow = document.createElement("div");
  container.appendChild(searchRow);

  const header = document.createElement("div");
  container.appendChild(header);

  const chipBar = document.createElement("div");
  chipBar.className = "flex gap-1.5 flex-wrap items-center";
  container.appendChild(chipBar);

  const sectionWrap = document.createElement("div");
  container.appendChild(sectionWrap);

  let studioId: string | undefined = initialId;
  let selectedFilterName: string | undefined; // undefined = "All"
  let watchedFilters: SavedFilter[] = [];
  let section: ReturnType<typeof renderSceneSection> | undefined;

  function renderHeaderPlaceholder(name?: string) {
    header.innerHTML = "";
    if (!studioId) return;
    const card = document.createElement("div");
    card.className = "rounded-lg border border-line bg-surface p-5";
    const h = document.createElement("h2");
    h.className = "text-xl font-semibold";
    h.textContent = name ?? "Loading…";
    card.appendChild(h);
    header.appendChild(card);
  }

  function renderChips() {
    chipBar.innerHTML = "";
    if (!studioId || watchedFilters.length === 0) return;
    const label = document.createElement("span");
    label.className = "text-xs text-text-faint mr-1";
    label.textContent = "Watched filter";
    chipBar.appendChild(label);
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
          studios: studioId,
          unadded: isInLibraryMode() ? undefined : "1",
          tags: cf?.tags as string | undefined,
          tags_modifier: cf?.tags_modifier as SceneFilter["tags_modifier"],
          exclude_tags: cf?.exclude_tags as string | undefined,
          sort: "DATE",
          direction: "DESC",
        };
        return api.queryScenes(filter, refresh);
      },
      emptyMessage: "No scenes found for this studio.",
    });
    sectionWrap.appendChild(section.element);
  }

  function loadStudio(id: string, name?: string) {
    studioId = id;
    renderChips();
    renderHeaderPlaceholder(name);
    api.studioDetails(id).then(
      (d) => {
        if (studioId === id) header.replaceChildren(renderStudioHeader(d));
      },
      () => {}, // keep the placeholder on failure
    );
    mountSection();
  }

  searchRow.appendChild(renderStudioSearch((id, name) => loadStudio(id, name)));

  api.listFilters().then((filters) => {
    watchedFilters = filters.filter((f) => f.watched);
    renderChips();
  });

  if (studioId) {
    loadStudio(studioId);
  } else {
    const hint = document.createElement("div");
    hint.className =
      "flex flex-col items-center gap-1 rounded-lg border border-dashed border-line py-16 text-center";
    const t = document.createElement("p");
    t.className = "text-text text-sm font-medium";
    t.textContent = "No studio selected";
    const sub = document.createElement("p");
    sub.className = "text-muted text-sm";
    sub.textContent = "Search above to browse a studio's scenes.";
    hint.append(t, sub);
    sectionWrap.appendChild(hint);
  }

  return container;
}
