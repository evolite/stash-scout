import { api, type SavedFilter, type SceneFilter } from "../api.js";
import { iconClose } from "../icons.js";

export async function renderSavedFiltersPanel(
  getCurrentFilter: () => SceneFilter,
  onLoad: (filter: SceneFilter) => void,
): Promise<HTMLElement> {
  const wrap = document.createElement("div");
  wrap.className = "mt-4 border-t border-black/20 pt-3";

  const heading = document.createElement("div");
  heading.textContent = "Saved filters";
  heading.className = "text-muted text-xs mb-2";
  wrap.appendChild(heading);

  const list = document.createElement("div");
  wrap.appendChild(list);

  async function refresh() {
    const filters = await api.listFilters();
    list.innerHTML = "";
    if (filters.length === 0) {
      const empty = document.createElement("div");
      empty.textContent = "None saved yet.";
      empty.className = "text-muted text-xs";
      list.appendChild(empty);
    }
    for (const f of filters) {
      list.appendChild(renderRow(f));
    }
  }

  function renderRow(f: SavedFilter): HTMLElement {
    const row = document.createElement("div");
    row.className = "flex items-center gap-2 py-1";

    const watch = document.createElement("input");
    watch.type = "checkbox";
    watch.checked = f.watched;
    watch.title = "Show this filter's results in Watched";
    watch.addEventListener("change", async () => {
      await api.setFilterWatched(f.id, watch.checked);
    });
    row.appendChild(watch);

    const name = document.createElement("button");
    name.type = "button";
    name.className = "flex-1 text-left cursor-pointer bg-transparent border-0 text-text rounded hover:text-link";
    name.textContent = f.name;
    name.addEventListener("click", () => onLoad(f.filter));
    row.appendChild(name);

    const overwrite = document.createElement("button");
    overwrite.className = "bg-transparent text-text hover:bg-white/10 rounded shrink-0 text-xs px-2 py-0.5";
    overwrite.textContent = "Save";
    overwrite.title = "Overwrite with the currently applied filter";
    overwrite.addEventListener("click", async () => {
      await api.overwriteFilter(f.id, getCurrentFilter());
      await refresh();
    });
    row.appendChild(overwrite);

    const del = document.createElement("button");
    del.className = "bg-transparent text-text hover:bg-white/10 rounded-full w-[22px] h-[22px] p-0 shrink-0 flex items-center justify-center";
    del.setAttribute("aria-label", "Delete saved filter");
    del.appendChild(iconClose());
    del.addEventListener("click", async () => {
      await api.deleteFilter(f.id);
      await refresh();
    });
    row.appendChild(del);
    return row;
  }

  const saveRow = document.createElement("div");
  saveRow.className = "flex items-stretch gap-2 mt-2";
  const nameInput = document.createElement("input");
  nameInput.placeholder = "Preset name";
  nameInput.className = "flex-1 min-w-0";
  const saveBtn = document.createElement("button");
  saveBtn.className = "bg-accent text-white rounded px-3 py-1.5 hover:brightness-110 shrink-0 whitespace-nowrap";
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
