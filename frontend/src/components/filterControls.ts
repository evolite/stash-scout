import { iconClose } from "../icons.js";

// Shared look-and-feel for the scene Browse filter and the Performers filter so
// the two sidebars stay visually identical. Both are a rounded surface card of
// stacked labelled fields, a primary Apply button, and a collapsible "Saved"
// block pinned at the top.
export const SIDEBAR_CLASS = "bg-surface rounded-xl p-4 flex flex-col gap-3.5";
export const LABEL_CLASS = "flex flex-col gap-1 text-xs font-medium text-muted";
export const PRIMARY_BTN =
  "bg-accent text-white rounded-lg px-3 py-2 text-sm font-semibold hover:brightness-110 transition-[filter]";
export const GHOST_BTN =
  "bg-black/20 text-text rounded-lg px-3 py-2 text-sm font-medium hover:bg-black/30 transition-colors shrink-0 whitespace-nowrap";

export function titleCase(v: string): string {
  return v.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

export function fieldText(
  label: string,
  placeholder: string,
  current: string | undefined,
  onChange: (v: string) => void,
): HTMLElement {
  const wrap = document.createElement("label");
  wrap.className = LABEL_CLASS;
  wrap.textContent = label;
  const input = document.createElement("input");
  input.type = "text";
  input.placeholder = placeholder;
  input.value = current ?? "";
  input.addEventListener("input", () => onChange(input.value.trim()));
  wrap.appendChild(input);
  return wrap;
}

export function fieldSelect(
  label: string,
  entries: readonly (string | readonly [string, string])[],
  current: string | undefined,
  anyLabel: string | undefined,
  onChange: (v: string) => void,
): HTMLElement {
  const wrap = document.createElement("label");
  wrap.className = LABEL_CLASS;
  wrap.textContent = label;
  const sel = document.createElement("select");
  const pairs: [string, string][] = [
    ...(anyLabel !== undefined ? ([["", anyLabel]] as [string, string][]) : []),
    ...entries.map((e) => (typeof e === "string" ? [e, titleCase(e)] : [e[0], e[1]]) as [string, string]),
  ];
  for (const [value, text] of pairs) {
    const opt = document.createElement("option");
    opt.value = value;
    opt.textContent = text;
    if ((current ?? "") === value) opt.selected = true;
    sel.appendChild(opt);
  }
  sel.addEventListener("change", () => onChange(sel.value));
  wrap.appendChild(sel);
  return wrap;
}

// A value + a modifier select (≥ / ≤ / =, or a custom pair). `type` is the
// value input's type — "number" for height/birth year, "text" for cup size.
export function fieldModifier(
  label: string,
  value: string | number | undefined,
  modifier: string | undefined,
  onChange: (value: string | undefined, modifier: string) => void,
  mods: readonly (readonly [string, string])[] = [
    ["GREATER_THAN", "≥"],
    ["LESS_THAN", "≤"],
    ["EQUALS", "="],
  ],
  type: "number" | "text" = "number",
): HTMLElement {
  const wrap = document.createElement("label");
  wrap.className = LABEL_CLASS;
  wrap.textContent = label;
  const row = document.createElement("div");
  row.className = "flex gap-2";
  const modSel = document.createElement("select");
  modSel.className = "shrink-0";
  for (const [v, t] of mods) {
    const opt = document.createElement("option");
    opt.value = v;
    opt.textContent = t;
    if ((modifier ?? mods[0][0]) === v) opt.selected = true;
    modSel.appendChild(opt);
  }
  const input = document.createElement("input");
  input.type = type;
  input.value = value === undefined ? "" : String(value);
  const emit = () => {
    const raw = input.value.trim();
    onChange(raw === "" ? undefined : raw, modSel.value);
  };
  modSel.addEventListener("change", emit);
  input.addEventListener("input", emit);
  row.append(modSel, input);
  wrap.appendChild(row);
  return wrap;
}

export function fieldCheckbox(label: string, checked: boolean, onChange: (checked: boolean) => void): HTMLElement {
  const wrap = document.createElement("label");
  wrap.className = "flex items-center gap-2 text-xs font-medium text-muted";
  const box = document.createElement("input");
  box.type = "checkbox";
  box.checked = checked;
  box.className = "w-auto";
  box.addEventListener("change", () => onChange(box.checked));
  wrap.append(box, document.createTextNode(label));
  return wrap;
}

export function applyButton(onClick: () => void, text = "Apply filters"): HTMLElement {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = PRIMARY_BTN;
  btn.textContent = text;
  btn.addEventListener("click", onClick);
  return btn;
}

// A disclosure wrapper: a header button (chevron + title + optional count) that
// shows/hides `body`. Open/closed state is remembered per `storageKey`.
export function collapsible(
  title: string,
  storageKey: string,
  body: HTMLElement,
  opts: { count?: number; defaultOpen?: boolean } = {},
): HTMLElement {
  const wrap = document.createElement("div");
  wrap.className = "rounded-lg bg-black/15";

  let open: boolean;
  try {
    const stored = localStorage.getItem(storageKey);
    open = stored === null ? !!opts.defaultOpen : stored === "1";
  } catch {
    open = !!opts.defaultOpen;
  }

  const header = document.createElement("button");
  header.type = "button";
  header.className =
    "w-full flex items-center gap-2 px-2.5 py-2 text-xs font-semibold text-text bg-transparent border-0 rounded-lg hover:bg-white/5";
  const chevron = document.createElement("span");
  chevron.textContent = "›";
  chevron.className = "inline-block transition-transform text-muted";
  const label = document.createElement("span");
  label.className = "flex-1 text-left";
  label.textContent = title;
  const count = document.createElement("span");
  count.className = "text-muted font-normal";
  header.append(chevron, label, count);

  const bodyWrap = document.createElement("div");
  bodyWrap.className = "px-2.5 pb-2.5 pt-0.5";
  bodyWrap.appendChild(body);

  function sync() {
    chevron.style.transform = open ? "rotate(90deg)" : "";
    bodyWrap.hidden = !open;
    if (opts.count !== undefined) count.textContent = opts.count ? `(${opts.count})` : "";
  }
  header.addEventListener("click", () => {
    open = !open;
    try {
      localStorage.setItem(storageKey, open ? "1" : "0");
    } catch {
      /* ignore */
    }
    sync();
  });
  sync();

  wrap.append(header, bodyWrap);
  return wrap;
}

// The "type a name, Save" row used by both sidebars' saved blocks.
export function saveRow(currentName: string, placeholder: string, onSave: (name: string) => void): HTMLElement {
  const row = document.createElement("div");
  row.className = "flex items-stretch gap-2 mt-2";
  const nameInput = document.createElement("input");
  nameInput.placeholder = placeholder;
  nameInput.value = currentName;
  nameInput.className = "flex-1 min-w-0";
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = GHOST_BTN;
  btn.textContent = "Save";
  btn.title = "Saves as new, unless one with this exact name exists — then it's overwritten";
  const save = () => {
    const name = nameInput.value.trim();
    if (name) onSave(name);
  };
  btn.addEventListener("click", save);
  nameInput.addEventListener("keydown", (e) => e.key === "Enter" && save());
  row.append(nameInput, btn);
  return row;
}

// One row in a saved list: name button (+ optional sub-label), optional trailing
// controls, delete button.
export function savedRow(opts: {
  name: string;
  active: boolean;
  onLoad: () => void;
  onDelete: () => void;
  trailing?: HTMLElement;
}): HTMLElement {
  const row = document.createElement("div");
  row.className = "group flex items-center gap-1.5 rounded-md px-1.5 py-1 hover:bg-white/5";

  const name = document.createElement("button");
  name.type = "button";
  name.className =
    "flex-1 min-w-0 text-left truncate bg-transparent border-0 p-0 text-xs hover:text-link " +
    (opts.active ? "text-link font-semibold" : "text-text");
  name.textContent = opts.name;
  name.title = "Load this";
  name.addEventListener("click", opts.onLoad);
  row.appendChild(name);

  if (opts.trailing) row.appendChild(opts.trailing);

  const del = document.createElement("button");
  del.type = "button";
  del.className =
    "shrink-0 w-5 h-5 p-0 flex items-center justify-center rounded bg-transparent text-muted opacity-0 group-hover:opacity-100 hover:bg-white/10 hover:text-text";
  del.setAttribute("aria-label", "Delete");
  del.appendChild(iconClose());
  del.addEventListener("click", opts.onDelete);
  row.appendChild(del);
  return row;
}
