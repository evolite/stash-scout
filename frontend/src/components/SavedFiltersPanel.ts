import { api, type SavedFilter, type SceneFilter } from "../api.js";

export async function renderSavedFiltersPanel(
  getCurrentFilter: () => SceneFilter,
  onLoad: (filter: SceneFilter) => void,
): Promise<HTMLElement> {
  const wrap = document.createElement("div");
  wrap.className = "SavedFilters";

  const heading = document.createElement("div");
  heading.textContent = "Saved filters";
  heading.style.cssText = "color:var(--muted);font-size:0.85rem;margin-bottom:0.5rem";
  wrap.appendChild(heading);

  const list = document.createElement("div");
  wrap.appendChild(list);

  async function refresh() {
    const filters = await api.listFilters();
    list.innerHTML = "";
    if (filters.length === 0) {
      const empty = document.createElement("div");
      empty.textContent = "None saved yet.";
      empty.style.color = "var(--muted)";
      list.appendChild(empty);
    }
    for (const f of filters) {
      list.appendChild(renderRow(f));
    }
  }

  function renderRow(f: SavedFilter): HTMLElement {
    const row = document.createElement("div");
    row.className = "SavedFilters-item";

    const watch = document.createElement("input");
    watch.type = "checkbox";
    watch.checked = f.watched;
    watch.title = "Show this filter's results in Watched";
    watch.addEventListener("change", async () => {
      await api.setFilterWatched(f.id, watch.checked);
    });
    row.appendChild(watch);

    const name = document.createElement("span");
    name.textContent = f.name;
    name.style.cssText = "cursor:pointer;flex:1";
    name.addEventListener("click", () => onLoad(f.filter));
    row.appendChild(name);

    const overwrite = document.createElement("button");
    overwrite.className = "btn minimal SavedFilters-overwrite";
    overwrite.textContent = "Save";
    overwrite.title = "Overwrite with the currently applied filter";
    overwrite.addEventListener("click", async () => {
      await api.overwriteFilter(f.id, getCurrentFilter());
      await refresh();
    });
    row.appendChild(overwrite);

    const del = document.createElement("button");
    del.className = "btn minimal SavedFilters-delete";
    del.textContent = "×";
    del.addEventListener("click", async () => {
      await api.deleteFilter(f.id);
      await refresh();
    });
    row.appendChild(del);
    return row;
  }

  const saveRow = document.createElement("div");
  saveRow.className = "SavedFilters-saveRow";
  const nameInput = document.createElement("input");
  nameInput.placeholder = "Preset name";
  nameInput.style.flex = "1";
  const saveBtn = document.createElement("button");
  saveBtn.className = "btn";
  saveBtn.textContent = "Save current";
  saveBtn.addEventListener("click", async () => {
    if (!nameInput.value.trim()) return;
    await api.saveFilter(nameInput.value.trim(), getCurrentFilter());
    nameInput.value = "";
    await refresh();
  });
  saveRow.appendChild(nameInput);
  saveRow.appendChild(saveBtn);
  wrap.appendChild(saveRow);

  await refresh();
  return wrap;
}
