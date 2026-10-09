import { api, type SavedFilter, type SceneFilter } from "../api.js";
import { isInLibraryMode } from "../components/Navbar.js";
import { renderChip } from "../components/Chip.js";
import { renderSceneSection } from "../components/SceneSection.js";
import { renderStudioSearch } from "../components/StudioSearch.js";
import { renderStudioHeader } from "../components/EntityHeader.js";
import { getState } from "../viewState.js";

const PER_PAGE = 32;

// Mirror of PerformersView: browse one studio's StashDB scenes, optionally
// narrowed by a chosen subscribed filter's tags/exclude_tags. The browsed studio
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

  // Survives render() so Back from a performer restores the studio, chip and page.
  const st = getState<{ studioId?: string; filterName?: string }>("studios", {});
  if (initialId && initialId !== st.studioId) {
    st.studioId = initialId;
    st.filterName = undefined;
  }
  let studioId: string | undefined = st.studioId;
  let subscribedFilters: SavedFilter[] = [];
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
    if (!studioId || subscribedFilters.length === 0) return;
    const label = document.createElement("span");
    label.className = "text-xs text-text-faint mr-1";
    label.textContent = "Subscribed filter";
    chipBar.appendChild(label);
    chipBar.appendChild(
      renderChip("All", st.filterName === undefined, () => {
        st.filterName = undefined;
        renderChips();
        section?.reset();
      }),
    );
    for (const f of subscribedFilters) {
      chipBar.appendChild(
        renderChip(f.name, st.filterName === f.name, () => {
          st.filterName = f.name;
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
        const chosen = subscribedFilters.find((f) => f.name === st.filterName);
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
      stateKey: `studio:${studioId}`,
    });
    sectionWrap.appendChild(section.element);
  }

  function loadStudio(id: string, name?: string) {
    if (id !== studioId) st.filterName = undefined;
    studioId = st.studioId = id;
    // Put the studio in the URL so Back from a performer pops to this studio.
    if (window.location.pathname !== `/studios/${id}`) history.replaceState(null, "", `/studios/${id}`);
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
    subscribedFilters = filters.filter((f) => f.subscribed);
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
