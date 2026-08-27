import { api } from "../api.js";

// Single-select "jump to this studio" typeahead — mirror of PerformerSearch.
// Selecting a result navigates immediately instead of adding to a filter list.
export function renderStudioSearch(onSelect: (id: string, name: string) => void): HTMLElement {
  const wrap = document.createElement("div");
  wrap.className = "relative max-w-sm";

  const input = document.createElement("input");
  input.type = "text";
  input.placeholder = "search studio name...";
  input.className = "w-full";
  wrap.appendChild(input);

  const results = document.createElement("div");
  wrap.appendChild(results);

  let debounce: ReturnType<typeof setTimeout>;
  input.addEventListener("input", () => {
    clearTimeout(debounce);
    const term = input.value.trim();
    if (!term) {
      results.innerHTML = "";
      return;
    }
    debounce = setTimeout(async () => {
      const matches = await api.searchStudios(term);
      results.innerHTML = "";
      const list = document.createElement("div");
      list.className = "TagPicker-dropdown";
      for (const m of matches) {
        const item = document.createElement("div");
        item.textContent = m.name;
        item.className = "TagPicker-dropdown-item";
        item.addEventListener("click", () => {
          input.value = "";
          results.innerHTML = "";
          onSelect(m.id, m.name);
        });
        list.appendChild(item);
      }
      results.appendChild(list);
    }, 250);
  });

  return wrap;
}
