import { api } from "../api.js";
import { iconClose } from "../icons.js";

// Global exclude tags apply everywhere scenes are fetched — Filters, Feed
// (New Releases + Trending) — instead of adding the same exclude to every
// saved filter individually.
export async function renderExcludeTagsPanel(): Promise<HTMLElement> {
  const wrap = document.createElement("div");
  wrap.className = "bg-surface rounded-lg p-3.5 flex flex-col gap-2 max-w-2xl";

  const note = document.createElement("p");
  note.className = "text-xs text-muted m-0";
  note.textContent = "Applied everywhere scenes are fetched — Filters, New Releases, and Trending — instead of adding the same exclude to every filter.";
  wrap.appendChild(note);

  const chips = document.createElement("div");
  chips.className = "flex gap-2 items-center mb-2 flex-wrap";
  wrap.appendChild(chips);

  const search = document.createElement("input");
  search.placeholder = "search tag to exclude...";
  const results = document.createElement("div");
  results.className = "relative";

  async function renderChips() {
    const tags = await api.listGlobalExcludeTags();
    chips.innerHTML = "";
    for (const t of tags) {
      const chip = document.createElement("span");
      chip.className = "bg-surface-2 border border-line rounded px-3 py-1 flex items-center gap-1.5";
      chip.textContent = t.name;
      const remove = document.createElement("button");
      remove.className = "bg-transparent border-0 text-muted p-0 hover:text-text";
      remove.setAttribute("aria-label", "Remove excluded tag");
      remove.appendChild(iconClose());
      remove.addEventListener("click", async () => {
        await api.removeGlobalExcludeTag(t.id);
        await renderChips();
      });
      chip.appendChild(remove);
      chips.appendChild(chip);
    }
    const searchWrap = document.createElement("div");
    searchWrap.appendChild(search);
    searchWrap.appendChild(results);
    chips.appendChild(searchWrap);
  }

  let debounce: ReturnType<typeof setTimeout>;
  search.addEventListener("input", () => {
    clearTimeout(debounce);
    const term = search.value.trim();
    if (!term) {
      results.innerHTML = "";
      return;
    }
    debounce = setTimeout(async () => {
      const matches = await api.searchTags(term);
      results.innerHTML = "";
      const list = document.createElement("div");
      list.className = "TagPicker-dropdown min-w-[200px]";
      for (const m of matches) {
        const item = document.createElement("div");
        item.textContent = m.name;
        item.className = "TagPicker-dropdown-item";
        item.addEventListener("click", async () => {
          await api.addGlobalExcludeTag(m.id, m.name);
          search.value = "";
          results.innerHTML = "";
          await renderChips();
        });
        list.appendChild(item);
      }
      results.appendChild(list);
    }, 250);
  });

  await renderChips();
  return wrap;
}
