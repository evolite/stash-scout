import { api, type PerformerFilter, type PerformerResult, type PerformerQueryResult, type SavedFilter, type SceneFilter } from "../api.js";
import { renderSkeletonGrid } from "./SkeletonGrid.js";
import { renderPagination } from "./Pagination.js";
import { renderPerformerHeader } from "./EntityHeader.js";
import { renderSceneSection } from "./SceneSection.js";
import { renderChip } from "./Chip.js";
import { isInLibraryMode } from "./Navbar.js";
import {
  SIDEBAR_CLASS,
  LABEL_CLASS,
  titleCase,
  fieldText,
  fieldSelect,
  fieldModifier,
  fieldCheckbox,
  applyButton,
  collapsible,
  emptyState,
  savedRow,
  saveRow,
} from "./filterControls.js";

// "Discover performers" — attribute search over StashDB. Gender / ethnicity /
// country / birth year / favourites are filtered by StashDB directly; eye
// colour, hair colour, height, cup size and has-tattoos / has-piercings are
// filtered by the server paging through StashDB's results (its API advertises
// those filters but ignores them). A card opens the Performers tab.
//
// A search can be saved by name (the "Preset name" box + Save, same pattern as
// the scene Browse sidebar) — the filter AND the fetched first page are stored,
// so a saved search restores instantly with no StashDB call. "Update" re-runs
// it against StashDB.
const PER_PAGE = 40;
const DETAIL_PER_PAGE = 32;

const GENDERS = ["FEMALE", "MALE", "TRANSGENDER_FEMALE", "TRANSGENDER_MALE", "INTERSEX", "UNKNOWN"];
const ETHNICITIES = ["CAUCASIAN", "BLACK", "ASIAN", "INDIAN", "LATIN", "MIDDLE_EASTERN", "MIXED", "OTHER", "UNKNOWN"];
const EYE_COLORS = ["BLUE", "BROWN", "GREEN", "GREY", "HAZEL", "RED"];
const HAIR_COLORS = ["BLONDE", "BRUNETTE", "BLACK", "RED", "AUBURN", "GREY", "BALD", "VARIOUS", "OTHER"];
const SORTS = ["SCENE_COUNT", "NAME", "BIRTHDATE", "CAREER_START_YEAR", "DEBUT", "CREATED_AT", "UPDATED_AT"];

function renderSidebar(
  current: PerformerFilter,
  presetName: string,
  onApply: (f: PerformerFilter) => void,
  onSave: (f: PerformerFilter, name: string) => void,
  savedBlock: HTMLElement,
): HTMLElement {
  const aside = document.createElement("aside");
  aside.className = SIDEBAR_CLASS;
  const draft: PerformerFilter = { ...current };

  aside.appendChild(savedBlock);

  const fields = document.createElement("div");
  fields.className = "flex flex-col gap-3.5";
  aside.appendChild(fields);

  // Filtered by StashDB itself.
  fields.append(
    fieldText("Name contains", "name…", draft.name, (v) => (draft.name = v || undefined)),
    fieldSelect("Gender", GENDERS, draft.gender, "Any", (v) => (draft.gender = v || undefined)),
    fieldSelect("Ethnicity", ETHNICITIES, draft.ethnicity, "Any", (v) => (draft.ethnicity = v || undefined)),
    fieldText("Country (ISO code, e.g. US)", "US", draft.country, (v) => (draft.country = v || undefined)),
    fieldModifier(
      "Birth year",
      draft.birth_year,
      draft.birth_year_modifier,
      (value, modifier) => {
        draft.birth_year = value && Number.isFinite(+value) ? +value : undefined;
        draft.birth_year_modifier = modifier as PerformerFilter["birth_year_modifier"];
      },
      [
        ["GREATER_THAN", "After"],
        ["LESS_THAN", "Before"],
      ],
    ),
    fieldCheckbox("Favourites only", draft.is_favorite === "1", (on) => (draft.is_favorite = on ? "1" : undefined)),
  );

  // Divider + note: everything below is ignored by StashDB and matched by us
  // paging through its results (see queryPerformers).
  const clientBreak = document.createElement("div");
  clientBreak.className = "border-t border-black/20 pt-3 flex flex-col gap-1";
  const clientTitle = document.createElement("p");
  clientTitle.className = "text-xs font-semibold text-text m-0";
  clientTitle.textContent = "Not filtered by StashDB";
  const clientNote = document.createElement("p");
  clientNote.className = "text-[11px] text-muted leading-tight m-0";
  clientNote.textContent =
    "StashDB ignores these, so we match them by scanning its results — counts are approximate and very narrow searches may stop short. Set gender / ethnicity / country above for the best results.";
  clientBreak.append(clientTitle, clientNote);
  fields.appendChild(clientBreak);

  fields.append(
    fieldSelect("Eye colour", EYE_COLORS, draft.eye_color, "Any", (v) => (draft.eye_color = v || undefined)),
    fieldSelect("Hair colour", HAIR_COLORS, draft.hair_color, "Any", (v) => (draft.hair_color = v || undefined)),
    fieldModifier("Height (cm)", draft.height, draft.height_modifier, (value, modifier) => {
      draft.height = value && Number.isFinite(+value) ? +value : undefined;
      draft.height_modifier = modifier as PerformerFilter["height_modifier"];
    }),
    fieldModifier(
      "Cup size (letter, e.g. D)",
      draft.cup_size,
      draft.cup_size_modifier,
      (value, modifier) => {
        draft.cup_size = value;
        draft.cup_size_modifier = modifier as PerformerFilter["cup_size_modifier"];
      },
      undefined,
      "text",
    ),
    fieldSelect("Tattoos", ["yes", "no"], draft.tattoos, "Any", (v) => (draft.tattoos = (v || undefined) as PerformerFilter["tattoos"])),
    fieldSelect("Piercings", ["yes", "no"], draft.piercings, "Any", (v) => (draft.piercings = (v || undefined) as PerformerFilter["piercings"])),
  );

  const sortRow = document.createElement("label");
  sortRow.className = LABEL_CLASS;
  sortRow.textContent = "Sort";
  const inner = document.createElement("div");
  inner.className = "flex gap-2";
  const sortSel = document.createElement("select");
  for (const v of SORTS) {
    const opt = document.createElement("option");
    opt.value = v;
    opt.textContent = titleCase(v);
    if ((draft.sort ?? "SCENE_COUNT") === v) opt.selected = true;
    sortSel.appendChild(opt);
  }
  sortSel.addEventListener("change", () => (draft.sort = sortSel.value));
  const dirSel = document.createElement("select");
  dirSel.className = "shrink-0";
  for (const v of ["DESC", "ASC"]) {
    const opt = document.createElement("option");
    opt.value = v;
    opt.textContent = v;
    if ((draft.direction ?? "DESC") === v) opt.selected = true;
    dirSel.appendChild(opt);
  }
  dirSel.addEventListener("change", () => (draft.direction = dirSel.value as "ASC" | "DESC"));
  inner.append(sortSel, dirSel);
  sortRow.appendChild(inner);
  fields.appendChild(sortRow);

  fields.appendChild(applyButton(() => onApply({ ...draft, page: 1 })));
  fields.appendChild(saveRow(presetName, "Name this search", (name) => onSave({ ...draft, page: 1 }, name)));

  return aside;
}

function renderCard(p: PerformerResult, onOpen: (id: string, name: string) => void): HTMLElement {
  const card = document.createElement("button");
  card.type = "button";
  card.className =
    "text-left bg-surface rounded-lg overflow-hidden border border-line hover:border-link transition-colors flex flex-col";
  card.addEventListener("click", () => onOpen(p.id, p.name));

  const img = document.createElement("div");
  img.className = "aspect-[2/3] bg-black/30 bg-center bg-cover";
  if (p.images[0]?.url) img.style.backgroundImage = `url("${p.images[0].url}")`;
  card.appendChild(img);

  const body = document.createElement("div");
  body.className = "p-2 flex flex-col gap-1";
  const name = document.createElement("div");
  name.className = "text-sm font-semibold text-text truncate";
  name.textContent = p.name;
  body.appendChild(name);

  const bits = [
    p.gender && titleCase(p.gender),
    p.age ? `${p.age}y` : null,
    p.country,
    p.ethnicity && titleCase(p.ethnicity),
    p.eye_color && `${titleCase(p.eye_color)} eyes`,
    p.hair_color && `${titleCase(p.hair_color)} hair`,
    p.height ? `${p.height}cm` : null,
    p.cup_size ? `${p.cup_size} cup` : null,
    `${p.scene_count} scenes`,
  ].filter(Boolean);
  const meta = document.createElement("div");
  meta.className = "text-[11px] text-muted leading-tight";
  meta.textContent = bits.join(" · ");
  body.appendChild(meta);

  card.appendChild(body);
  return card;
}

// Persisted across re-mounts (e.g. returning here via the browser Back button
// after opening a performer) so the grid comes back exactly as it was left —
// same filter, same results — with no re-query.
let persistedFilter: PerformerFilter | undefined;
let persistedResult: PerformerQueryResult | undefined;
let persistedSearchId: string | undefined;
let persistedName = "";

export function renderPerformerBrowse(initialDetailId?: string): HTMLElement {
  const pane = document.createElement("div");
  pane.className = "grid gap-6 items-start grid-cols-[260px_1fr]";

  const sidebarCol = document.createElement("div");
  const contentCol = document.createElement("div");
  pane.append(sidebarCol, contentCol);

  // Right column shows either the results grid or one performer's detail
  // (scenes). The filter sidebar stays put across the switch; opening a
  // performer pushes /performers/<id> so the browser Back button returns to
  // the grid (main.ts's popstate re-mounts this in grid mode, restoring the
  // persisted results below — no re-query).
  let detailId: string | undefined = initialDetailId;

  let filter: PerformerFilter = persistedFilter
    ? { ...persistedFilter }
    : { page: 1, per_page: PER_PAGE, sort: "SCENE_COUNT", direction: "DESC" };
  let lastResult: PerformerQueryResult | undefined = persistedResult;
  let loadedSearchId: string | undefined = persistedSearchId;
  let loadedName = persistedName;

  function persist() {
    persistedFilter = { ...filter };
    persistedResult = lastResult;
    persistedSearchId = loadedSearchId;
    persistedName = loadedName;
  }

  function renderSidebarCol() {
    sidebarCol.innerHTML = "";
    const savedHost = document.createElement("div");
    sidebarCol.appendChild(renderSidebar(filter, loadedName, onApply, onSave, savedHost));
    renderSavedPanel(savedHost).catch(() => {});
  }

  function onApply(next: PerformerFilter) {
    filter = { ...filter, ...next };
    loadedSearchId = undefined;
    loadedName = "";
    leaveDetail();
    renderSidebarCol();
    load();
  }

  // A sidebar action (apply / load saved search) while viewing a performer
  // drops back to the grid and clears the stale /performers/<id> URL.
  function leaveDetail() {
    if (!detailId) return;
    detailId = undefined;
    if (window.location.pathname !== "/") history.replaceState(null, "", "/");
  }

  async function onSave(draft: PerformerFilter, name: string) {
    filter = { ...draft };
    // Always fetch the page fresh so the stored results match the saved filter.
    const results = await api.queryPerformers({ ...filter, page: 1 });
    try {
      const existing = (await api.listPerformerSearches()).find((s) => s.name === name);
      if (existing) {
        await api.updatePerformerSearch(existing.id, { filter, results });
        loadedSearchId = existing.id;
      } else {
        loadedSearchId = (await api.savePerformerSearch(name, filter, results)).id;
      }
      loadedName = name;
      renderResults(results);
      renderSidebarCol();
    } catch (err) {
      alert(`Couldn't save search: ${(err as Error).message}`);
    }
  }

  async function onLoadSaved(id: string) {
    const full = await api.getPerformerSearch(id);
    filter = { ...(full.filter as PerformerFilter), page: 1 };
    loadedSearchId = full.id;
    loadedName = full.name;
    leaveDetail();
    renderSidebarCol();
    renderResults(full.results as PerformerQueryResult);
  }

  function renderResults(result: PerformerQueryResult) {
    lastResult = result;
    persist();
    contentCol.innerHTML = "";
    if (result.performers.length === 0) {
      contentCol.appendChild(emptyState("No performers match these filters", "Loosen a filter and Apply again."));
      return;
    }
    const grid = document.createElement("div");
    grid.className = "grid gap-4 grid-cols-[repeat(auto-fill,minmax(160px,1fr))]";
    for (const perf of result.performers) grid.appendChild(renderCard(perf, showDetail));
    contentCol.appendChild(grid);
    contentCol.appendChild(
      renderPagination({
        page: filter.page ?? 1,
        perPage: PER_PAGE,
        count: result.count,
        approximate: !!result.approximateCount,
        onPage: (page) => {
          filter = { ...filter, page };
          load();
        },
      }),
    );
  }

  async function load() {
    contentCol.innerHTML = "";
    contentCol.appendChild(renderSkeletonGrid());
    try {
      renderResults(await api.queryPerformers(filter));
    } catch (err) {
      contentCol.innerHTML = "";
      const p = document.createElement("p");
      p.className = "text-muted text-sm";
      p.textContent = `Failed to load performers: ${(err as Error).message}`;
      contentCol.appendChild(p);
    }
  }

  // Collapsible "Saved searches" block pinned at the top of the sidebar (see
  // SavedFiltersPanel for the scene-filter twin). A name restores the stored
  // first page instantly; ✕ deletes; when one is loaded, "Update" re-runs it
  // against StashDB and overwrites the stored page.
  async function renderSavedPanel(host: HTMLElement) {
    let searches: Awaited<ReturnType<typeof api.listPerformerSearches>>;
    try {
      searches = await api.listPerformerSearches();
    } catch (err) {
      const e = document.createElement("p");
      e.className = "text-muted text-xs px-1.5 py-1";
      e.textContent = `Couldn't load: ${(err as Error).message}`;
      host.replaceChildren(collapsible("Saved searches", "perfSaved.open", e));
      return;
    }

    const body = document.createElement("div");
    body.className = "flex flex-col gap-0.5";

    if (searches.length === 0) {
      const empty = document.createElement("p");
      empty.className = "text-muted text-xs px-1.5 py-1";
      empty.textContent = "None saved yet — set filters and Save.";
      body.appendChild(empty);
    }

    for (const s of searches) {
      const badge = document.createElement("span");
      badge.className = "shrink-0 text-[10px] text-muted tabular-nums";
      badge.textContent = String(s.resultCount);
      body.appendChild(
        savedRow({
          name: s.name,
          active: s.id === loadedSearchId,
          onLoad: () => onLoadSaved(s.id),
          onDelete: async () => {
            await api.deletePerformerSearch(s.id);
            if (loadedSearchId === s.id) {
              loadedSearchId = undefined;
              loadedName = "";
            }
            renderSidebarCol();
          },
          trailing: badge,
        }),
      );
    }

    if (loadedSearchId) {
      const update = document.createElement("button");
      update.type = "button";
      update.className = "mt-2 self-start text-xs text-link hover:underline bg-transparent border-0 p-0";
      update.textContent = "↻ Update this search";
      update.title = "Re-run against StashDB and overwrite the stored results";
      update.addEventListener("click", async () => {
        update.disabled = true;
        update.textContent = "Updating…";
        try {
          const fresh = await api.queryPerformers({ ...filter, page: 1 }, true);
          await api.updatePerformerSearch(loadedSearchId!, { filter, results: fresh });
          filter = { ...filter, page: 1 };
          renderResults(fresh);
          renderSidebarCol();
        } catch (err) {
          update.disabled = false;
          update.textContent = `Failed: ${(err as Error).message}`;
        }
      });
      body.appendChild(update);
    }

    const note = document.createElement("p");
    note.className = "text-[11px] text-muted leading-tight mt-2";
    note.textContent = "Restores the first page instantly. Paging and Update query StashDB.";
    body.appendChild(note);

    host.replaceChildren(collapsible("Saved searches", "perfSaved.open", body, { count: searches.length }));
  }

  function showDetail(id: string, name?: string) {
    detailId = id;
    history.pushState(null, "", `/performers/${id}`);
    renderDetail(id, name);
  }

  // Back to the grid without a history push — used by the in-detail "Back to
  // results" button, which calls history.back(); this is the fallback path.
  function showGrid() {
    detailId = undefined;
    if (lastResult) renderResults(lastResult);
    else renderIdleHint();
  }

  // Ported from the old standalone Performers tab: performer search box, header,
  // watched-filter chips, and the scene list pinned to this performer.
  function renderDetail(id: string, knownName?: string) {
    contentCol.innerHTML = "";

    const back = document.createElement("button");
    back.type = "button";
    back.className = "text-xs text-link hover:underline bg-transparent border-0 p-0 self-start mb-2";
    back.textContent = "← Back to results";
    back.addEventListener("click", () => (window.history.length > 1 ? history.back() : showGrid()));
    contentCol.appendChild(back);

    const wrap = document.createElement("div");
    wrap.className = "flex flex-col gap-4";
    contentCol.appendChild(wrap);

    const header = document.createElement("div");
    const card = document.createElement("div");
    card.className = "rounded-lg border border-line bg-surface p-5";
    const h = document.createElement("h2");
    h.className = "text-xl font-semibold";
    h.textContent = knownName ?? "Loading…";
    card.appendChild(h);
    header.appendChild(card);
    wrap.appendChild(header);
    api.performerDetails(id).then(
      (d) => {
        if (detailId === id) header.replaceChildren(renderPerformerHeader(d));
      },
      () => {},
    );

    const chipBar = document.createElement("div");
    chipBar.className = "flex gap-1.5 flex-wrap items-center";
    wrap.appendChild(chipBar);

    const sectionWrap = document.createElement("div");
    wrap.appendChild(sectionWrap);

    let selectedFilterName: string | undefined;
    let watchedFilters: SavedFilter[] = [];
    let section: ReturnType<typeof renderSceneSection> | undefined;

    function mountSection() {
      sectionWrap.innerHTML = "";
      section = renderSceneSection({
        perPage: DETAIL_PER_PAGE,
        fetchPage: async (page, refresh) => {
          const chosen = watchedFilters.find((f) => f.name === selectedFilterName);
          const cf = chosen?.filter as Record<string, unknown> | undefined;
          const filter: SceneFilter = {
            page,
            per_page: DETAIL_PER_PAGE,
            performers: id,
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

    function renderChips() {
      chipBar.innerHTML = "";
      if (watchedFilters.length === 0) return;
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

    mountSection();
    api.listFilters().then((filters) => {
      if (detailId !== id) return;
      watchedFilters = filters.filter((f) => f.watched);
      renderChips();
    });
  }

  function renderIdleHint() {
    contentCol.innerHTML = "";
    contentCol.appendChild(
      emptyState("Set filters, then Apply", "Or restore a saved search from the sidebar."),
    );
  }

  renderSidebarCol();
  if (detailId) renderDetail(detailId);
  else if (persistedResult) renderResults(persistedResult);
  else renderIdleHint();
  return pane;
}
