import { api, type SavedFilter } from "../api.js";
import { collapsible, savedRow } from "./filterControls.js";

// Collapsible "Saved filters" block pinned at the top of the Browse sidebar
// (twin of PerformerBrowse's renderSavedPanel). A name loads the filter; the
// checkbox toggles whether its results feed the Feed; ✕ deletes. Saving is the
// sidebar's own name+Save row, not here.
export async function renderSavedFiltersPanel(
  host: HTMLElement,
  onLoad: (saved: SavedFilter) => void,
): Promise<void> {
  async function refresh() {
    let filters: SavedFilter[];
    try {
      filters = await api.listFilters();
    } catch (err) {
      const e = document.createElement("p");
      e.className = "text-muted text-xs px-1.5 py-1";
      e.textContent = `Couldn't load: ${(err as Error).message}`;
      host.replaceChildren(collapsible("Saved filters", "sceneSaved.open", e));
      return;
    }

    const body = document.createElement("div");
    body.className = "flex flex-col gap-0.5";

    if (filters.length === 0) {
      const empty = document.createElement("p");
      empty.className = "text-muted text-xs px-1.5 py-1";
      empty.textContent = "None saved yet — set filters and Save.";
      body.appendChild(empty);
    }

    for (const f of filters) {
      const subscribe = document.createElement("input");
      subscribe.type = "checkbox";
      subscribe.checked = f.subscribed;
      subscribe.className = "shrink-0 w-auto";
      subscribe.title = "Subscribe: show this filter's results in the Feed";
      subscribe.addEventListener("click", (e) => e.stopPropagation());
      subscribe.addEventListener("change", () => api.setFilterSubscribed(f.id, subscribe.checked));

      body.appendChild(
        savedRow({
          name: f.name,
          active: false,
          onLoad: () => onLoad(f),
          onDelete: async () => {
            await api.deleteFilter(f.id);
            await refresh();
          },
          trailing: subscribe,
        }),
      );
    }

    host.replaceChildren(collapsible("Saved filters", "sceneSaved.open", body, { count: filters.length }));
  }

  await refresh();
}
