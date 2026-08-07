import { api, type SceneFilter } from "../api.js";
import { iconClose } from "../icons.js";

const LABEL_CLASS = "flex flex-col gap-1 text-xs text-muted";

// Tag/performer/studio pickers here are simple comma-separated-id inputs backed by
// a typeahead search — enough to exercise StashDB's INCLUDES/INCLUDES_ALL/EXCLUDES
// modifiers without building a full multi-select widget.
function idPicker(
  label: string,
  placeholder: string,
  initial: string,
  onChange: (ids: string) => void,
  search: (term: string) => Promise<{ id: string; name: string }[]>,
  byIds: (ids: string[]) => Promise<{ id: string; name: string }[]>,
): HTMLElement {
  const wrap = document.createElement("label");
  wrap.className = LABEL_CLASS;
  wrap.textContent = label;

  const input = document.createElement("input");
  input.type = "text";
  input.placeholder = placeholder;

  const chips = document.createElement("div");
  chips.className = "flex gap-2 items-center flex-wrap";

  let selected: { id: string; name: string }[] = initial
    ? initial.split(",").map((id) => ({ id, name: id }))
    : [];

  if (initial) {
    byIds(initial.split(",")).then((resolved) => {
      const byId = new Map(resolved.map((t) => [t.id, t.name]));
      selected = selected.map((t) => ({ id: t.id, name: byId.get(t.id) ?? t.name }));
      renderChips();
    });
  }

  function renderChips() {
    chips.innerHTML = "";
    for (const t of selected) {
      const chip = document.createElement("span");
      chip.className = "bg-surface border border-line rounded px-3 py-1 flex items-center gap-1.5";
      chip.textContent = t.name;
      const remove = document.createElement("button");
      remove.className = "bg-transparent border-0 text-muted p-0 hover:text-text";
      remove.setAttribute("aria-label", "Remove tag");
      remove.appendChild(iconClose());
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
  results.className = "relative";

  let debounce: ReturnType<typeof setTimeout>;
  input.addEventListener("input", () => {
    clearTimeout(debounce);
    const term = input.value.trim();
    if (!term) {
      results.innerHTML = "";
      return;
    }
    debounce = setTimeout(async () => {
      const matches = await search(term);
      results.innerHTML = "";
      const list = document.createElement("div");
      list.className = "TagPicker-dropdown";
      for (const m of matches) {
        const item = document.createElement("div");
        item.textContent = m.name;
        item.className = "TagPicker-dropdown-item";
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

export function renderFilterSidebar(
  current: SceneFilter,
  onApply: (filter: SceneFilter) => void,
  presetName: string,
  onSave: (filter: SceneFilter, name: string) => void,
): HTMLElement {
  const aside = document.createElement("aside");
  aside.className = "bg-surface rounded-lg p-4 flex flex-col gap-3";

  const draft: SceneFilter = { ...current };

  const textLabel = document.createElement("label");
  textLabel.className = LABEL_CLASS;
  textLabel.textContent = "Text";
  const textInput = document.createElement("input");
  textInput.value = draft.text ?? "";
  textInput.addEventListener("input", () => (draft.text = textInput.value));
  textLabel.appendChild(textInput);
  aside.appendChild(textLabel);

  aside.appendChild(
    idPicker("Tags", "search tag name...", draft.tags ?? "", (ids) => {
      draft.tags = ids || undefined;
    }, api.searchTags, api.tagsByIds),
  );

  const modifierLabel = document.createElement("label");
  modifierLabel.className = LABEL_CLASS;
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
    idPicker("Exclude tags (NOT)", "search tag name...", draft.exclude_tags ?? "", (ids) => {
      draft.exclude_tags = ids || undefined;
    }, api.searchTags, api.tagsByIds),
  );

  aside.appendChild(
    idPicker("Performers", "search performer name...", draft.performers ?? "", (ids) => {
      draft.performers = ids || undefined;
    }, api.searchPerformers, api.performersByIds),
  );

  aside.appendChild(
    idPicker("Studios", "search studio name...", draft.studios ?? "", (ids) => {
      draft.studios = ids || undefined;
    }, api.searchStudios, api.studiosByIds),
  );

  const dateLabel = document.createElement("label");
  dateLabel.className = LABEL_CLASS;
  dateLabel.textContent = "Release date";
  const dateRow = document.createElement("div");
  dateRow.className = "flex gap-2";
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
  sortLabel.className = LABEL_CLASS;
  sortLabel.textContent = "Sort";
  const sortRow = document.createElement("div");
  sortRow.className = "flex gap-2";
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
  apply.className = "bg-accent text-white rounded px-3 py-1.5 hover:brightness-110";
  apply.textContent = "Apply filters";
  apply.addEventListener("click", () => onApply({ ...draft, page: 1 }));
  aside.appendChild(apply);

  const saveRow = document.createElement("div");
  saveRow.className = "flex items-stretch gap-2 border-t border-black/20 pt-3";
  const nameInput = document.createElement("input");
  nameInput.placeholder = "Preset name";
  nameInput.value = presetName;
  nameInput.className = "flex-1 min-w-0";
  const saveBtn = document.createElement("button");
  saveBtn.className = "bg-secondary text-white rounded px-3 py-1.5 hover:bg-surface-hover shrink-0 whitespace-nowrap";
  saveBtn.textContent = "Save";
  saveBtn.title = "Save as a new preset, or overwrite the loaded one if you didn't change the name";
  saveBtn.addEventListener("click", () => {
    const name = nameInput.value.trim();
    if (!name) return;
    onSave({ ...draft, page: 1 }, name);
  });
  saveRow.appendChild(nameInput);
  saveRow.appendChild(saveBtn);
  aside.appendChild(saveRow);

  return aside;
}
