import { api, type SavedFilter } from "../api.js";
import { iconClose } from "../icons.js";

export async function renderSavedFiltersPanel(onLoad: (saved: SavedFilter) => void): Promise<HTMLElement> {
  const wrap = document.createElement("div");
  wrap.className = "mt-4 border-t border-black/20 pt-3";

  const columnHeader = document.createElement("div");
  columnHeader.className = "flex items-center gap-2 mb-2";
  const heading = document.createElement("span");
  heading.textContent = "Saved filters";
  heading.className = "flex-1 text-muted text-xs";
  const watchHeader = document.createElement("span");
  watchHeader.className = "w-8 shrink-0 text-center text-[10px] uppercase tracking-wide text-muted";
  watchHeader.textContent = "Watch";
  const delHeaderSpacer = document.createElement("span");
  delHeaderSpacer.className = "w-[22px] shrink-0";
  columnHeader.appendChild(heading);
  columnHeader.appendChild(watchHeader);
  columnHeader.appendChild(delHeaderSpacer);
  wrap.appendChild(columnHeader);

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

    const name = document.createElement("button");
    name.type = "button";
    name.className = "flex-1 text-left cursor-pointer bg-transparent border-0 text-text rounded hover:text-link";
    name.textContent = f.name;
    name.title = "Load this filter — its name fills the Preset name box below, so Save updates it";
    name.addEventListener("click", () => onLoad(f));
    row.appendChild(name);

    const watchCol = document.createElement("span");
    watchCol.className = "w-8 shrink-0 flex justify-center";
    const watch = document.createElement("input");
    watch.type = "checkbox";
    watch.checked = f.watched;
    watch.title = "Show this filter's results in the Feed";
    watch.addEventListener("change", async () => {
      await api.setFilterWatched(f.id, watch.checked);
    });
    watchCol.appendChild(watch);
    row.appendChild(watchCol);

    const del = document.createElement("button");
    del.className = "bg-transparent text-text hover:bg-white/10 rounded w-[22px] h-[22px] p-0 shrink-0 flex items-center justify-center";
    del.setAttribute("aria-label", "Delete saved filter");
    del.appendChild(iconClose());
    del.addEventListener("click", async () => {
      await api.deleteFilter(f.id);
      await refresh();
    });
    row.appendChild(del);
    return row;
  }

  await refresh();
  return wrap;
}
