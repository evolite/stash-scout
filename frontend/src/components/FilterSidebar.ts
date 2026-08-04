import { api, type SceneFilter } from "../api.js";

// Tag/performer/studio pickers here are simple comma-separated-id inputs backed by
// a typeahead search — enough to exercise StashDB's INCLUDES/INCLUDES_ALL/EXCLUDES
// modifiers without building a full multi-select widget.
export function tagPicker(label: string, initial: string, onChange: (ids: string) => void): HTMLElement {
  const wrap = document.createElement("label");
  wrap.textContent = label;

  const input = document.createElement("input");
  input.type = "text";
  input.placeholder = "search tag name...";

  const chips = document.createElement("div");
  chips.className = "WatchedTagsManage";
  chips.style.marginBottom = "0";

  let selected: { id: string; name: string }[] = initial
    ? initial.split(",").map((id) => ({ id, name: id }))
    : [];

  if (initial) {
    api.tagsByIds(initial.split(",")).then((resolved) => {
      const byId = new Map(resolved.map((t) => [t.id, t.name]));
      selected = selected.map((t) => ({ id: t.id, name: byId.get(t.id) ?? t.name }));
      renderChips();
    });
  }

  function renderChips() {
    chips.innerHTML = "";
    for (const t of selected) {
      const chip = document.createElement("span");
      chip.className = "Chip";
      chip.textContent = t.name;
      const remove = document.createElement("button");
      remove.textContent = "×";
      remove.addEventListener("click", () => {
        selected = selected.filter((s) => s.id !== t.id);
        renderChips();
        onChange(selected.map((s) => s.id).join(","));
      });
      chip.appendChild(remove);
      chips.appendChild(chip);
    }
  }
  renderChips();

  const results = document.createElement("div");
  results.style.position = "relative";

  let debounce: ReturnType<typeof setTimeout>;
  input.addEventListener("input", () => {
    clearTimeout(debounce);
    const term = input.value.trim();
    if (!term) {
      results.innerHTML = "";
      return;
    }
    debounce = setTimeout(async () => {
      const matches = await api.searchTags(term);
      results.innerHTML = "";
      const list = document.createElement("div");
      list.style.cssText = "position:absolute;background:var(--secondary);border-radius:3px;z-index:10;max-height:200px;overflow:auto;width:100%";
      for (const m of matches) {
        const item = document.createElement("div");
        item.textContent = m.name;
        item.style.cssText = "padding:0.35rem 0.5rem;cursor:pointer";
        item.addEventListener("click", () => {
          if (!selected.some((s) => s.id === m.id)) selected.push(m);
          renderChips();
          onChange(selected.map((s) => s.id).join(","));
          input.value = "";
          results.innerHTML = "";
        });
        list.appendChild(item);
      }
      results.appendChild(list);
    }, 250);
  });

  wrap.appendChild(input);
  wrap.appendChild(results);
  wrap.appendChild(chips);
  return wrap;
}

export function renderFilterSidebar(current: SceneFilter, onApply: (filter: SceneFilter) => void): HTMLElement {
  const aside = document.createElement("aside");
  aside.className = "FilterSidebar";

  const draft: SceneFilter = { ...current };

  const textLabel = document.createElement("label");
  textLabel.textContent = "Text";
  const textInput = document.createElement("input");
  textInput.value = draft.text ?? "";
  textInput.addEventListener("input", () => (draft.text = textInput.value));
  textLabel.appendChild(textInput);
  aside.appendChild(textLabel);

  aside.appendChild(
    tagPicker("Tags", draft.tags ?? "", (ids) => {
      draft.tags = ids || undefined;
    }),
  );

  const modifierLabel = document.createElement("label");
  modifierLabel.textContent = "Tag match";
  const modifierSelect = document.createElement("select");
  for (const [value, label] of [
    ["INCLUDES_ALL", "Has all (AND)"],
    ["INCLUDES", "Has any (OR)"],
    ["EXCLUDES", "Excludes"],
  ] as const) {
    const opt = document.createElement("option");
    opt.value = value;
    opt.textContent = label;
    if (draft.tags_modifier === value) opt.selected = true;
    modifierSelect.appendChild(opt);
  }
  modifierSelect.addEventListener("change", () => (draft.tags_modifier = modifierSelect.value as SceneFilter["tags_modifier"]));
  modifierLabel.appendChild(modifierSelect);
  aside.appendChild(modifierLabel);

  // StashDB's API can't combine an include-tags filter with an exclude-tags filter
  // in one query, so this is resolved server-side (see /api/scenes handling of
  // exclude_tags) rather than faked by filtering results in the browser.
  aside.appendChild(
    tagPicker("Exclude tags (NOT)", draft.exclude_tags ?? "", (ids) => {
      draft.exclude_tags = ids || undefined;
    }),
  );

  const dateLabel = document.createElement("label");
  dateLabel.textContent = "Release date";
  const dateRow = document.createElement("div");
  dateRow.style.cssText = "display:flex;gap:0.4rem";
  const dateModSelect = document.createElement("select");
  for (const [value, label] of [
    ["EQUALS", "On"],
    ["GREATER_THAN", "After"],
    ["LESS_THAN", "Before"],
  ] as const) {
    const opt = document.createElement("option");
    opt.value = value;
    opt.textContent = label;
    if (draft.date_modifier === value) opt.selected = true;
    dateModSelect.appendChild(opt);
  }
  dateModSelect.addEventListener("change", () => (draft.date_modifier = dateModSelect.value as SceneFilter["date_modifier"]));
  const dateInput = document.createElement("input");
  dateInput.type = "date";
  dateInput.value = draft.date ?? "";
  dateInput.addEventListener("input", () => (draft.date = dateInput.value));
  dateRow.appendChild(dateModSelect);
  dateRow.appendChild(dateInput);
  dateLabel.appendChild(dateRow);
  aside.appendChild(dateLabel);

  const sortLabel = document.createElement("label");
  sortLabel.textContent = "Sort";
  const sortRow = document.createElement("div");
  sortRow.style.cssText = "display:flex;gap:0.4rem";
  const sortSelect = document.createElement("select");
  for (const value of ["DATE", "TITLE", "DURATION", "TRENDING", "POPULARITY", "CREATED_AT", "UPDATED_AT"]) {
    const opt = document.createElement("option");
    opt.value = value;
    opt.textContent = value;
    if ((draft.sort ?? "DATE") === value) opt.selected = true;
    sortSelect.appendChild(opt);
  }
  sortSelect.addEventListener("change", () => (draft.sort = sortSelect.value));
  const dirSelect = document.createElement("select");
  for (const value of ["DESC", "ASC"]) {
    const opt = document.createElement("option");
    opt.value = value;
    opt.textContent = value;
    if ((draft.direction ?? "DESC") === value) opt.selected = true;
    dirSelect.appendChild(opt);
  }
  dirSelect.addEventListener("change", () => (draft.direction = dirSelect.value as SceneFilter["direction"]));
  sortRow.appendChild(sortSelect);
  sortRow.appendChild(dirSelect);
  sortLabel.appendChild(sortRow);
  aside.appendChild(sortLabel);

  const apply = document.createElement("button");
  apply.className = "btn";
  apply.textContent = "Apply filters";
  apply.addEventListener("click", () => onApply({ ...draft, page: 1 }));
  aside.appendChild(apply);

  return aside;
}
