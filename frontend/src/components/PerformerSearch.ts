import { api } from "../api.js";

// A single-select "jump to this performer" typeahead — deliberately not
// FilterSidebar's idPicker, which is chip/multi-select for building a filter
// criterion. Selecting a result here navigates immediately instead of adding
// to a list.
export function renderPerformerSearch(onSelect: (id: string, name: string) => void): HTMLElement {
  const wrap = document.createElement("div");
  wrap.className = "relative max-w-sm";

  const input = document.createElement("input");
  input.type = "text";
  input.placeholder = "search performer name...";
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
      const matches = await api.searchPerformers(term);
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
