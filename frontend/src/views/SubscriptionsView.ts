import { api, type SavedFilter, type SceneFilter } from "../api.js";
import type { Tab } from "../components/Navbar.js";
import { PRIMARY_BTN } from "../components/filterControls.js";
import { getState, setSubscriptionMode } from "../viewState.js";

const CARD = "bg-surface border border-line rounded-lg";
const SECTION_LABEL = "m-0 text-[11px] font-medium uppercase tracking-wider text-text-faint";
const LINK_BTN = "bg-transparent border-0 p-0 text-xs text-muted hover:text-text";
const CHIP = "rounded-full bg-surface-3 px-2 py-0.5 text-[11px] text-muted";

function el(tag: string, className: string, text?: string): HTMLElement {
  const e = document.createElement(tag);
  e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}

const count = (csv?: string) => (csv ? csv.split(",").filter(Boolean).length : 0);

// Tag/performer/studio filters are stored as ids, so summarise by count.
function summarise(f: SceneFilter): string[] {
  const out: string[] = [];
  if (f.text) out.push(`"${f.text}"`);
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
  if (count(f.tags)) out.push(plural(count(f.tags), "tag"));
  if (count(f.exclude_tags)) out.push(`${count(f.exclude_tags)} excluded`);
  if (count(f.performers)) out.push(plural(count(f.performers), "performer"));
  if (count(f.studios)) out.push(plural(count(f.studios), "studio"));
  if (f.favorites) out.push(f.favorites === "ALL" ? "favorites" : `favorite ${f.favorites.toLowerCase()}s`);
  if (f.date) out.push(`date ${f.date}`);
  if (f.max_duration) out.push(`≤ ${f.max_duration} min`);
  return out.length ? out : ["all scenes"];
}

function toggle(on: boolean, onChange: (next: boolean) => void): HTMLElement {
  const btn = el(
    "button",
    `relative shrink-0 w-9 h-5 rounded-full border-0 p-0 transition-colors ${on ? "bg-accent" : "bg-surface-3"}`,
  );
  btn.setAttribute("role", "switch");
  btn.setAttribute("aria-checked", String(on));
  btn.title = on ? "Active — click to pause" : "Paused — click to resume";
  const knob = el("span", "absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform");
  knob.style.transform = on ? "translateX(16px)" : "";
  btn.appendChild(knob);
  btn.addEventListener("click", () => onChange(!on));
  return btn;
}

export function renderSubscriptionsView(navigate: (tab: Tab) => void): HTMLElement {
  const container = el("div", "flex flex-col gap-5 max-w-3xl");
  const body = el("div", "flex flex-col gap-5");

  function startNew() {
    const st = getState<{ filter?: SceneFilter; name: string }>("browse", { name: "" });
    st.name = "";
    setSubscriptionMode("new");
    navigate("browse");
  }

  function edit(f: SavedFilter) {
    const st = getState<{ filter?: SceneFilter; name: string }>("browse", { name: "" });
    st.filter = { per_page: 32, sort: "DATE", direction: "DESC", ...f.filter, page: 1 };
    st.name = f.name;
    setSubscriptionMode("edit", f.id);
    navigate("browse");
  }

  function card(f: SavedFilter): HTMLElement {
    const row = el("div", `${CARD} px-4 py-3 flex items-center gap-4`);
    const info = el("div", "flex-1 min-w-0 flex flex-col gap-1.5");
    const name = el("button", "self-start max-w-full truncate bg-transparent border-0 p-0 text-left text-sm font-semibold text-text hover:text-link", f.name);
    name.title = "Edit this subscription";
    name.addEventListener("click", () => edit(f));
    const chips = el("div", "flex flex-wrap gap-1.5");
    for (const s of summarise(f.filter)) chips.appendChild(el("span", CHIP, s));
    info.append(name, chips);

    const editBtn = el("button", LINK_BTN, "Edit");
    editBtn.addEventListener("click", () => edit(f));

    const rename = el("button", LINK_BTN, "Rename");
    rename.addEventListener("click", () => {
      const input = document.createElement("input");
      input.value = f.name;
      input.className = "text-sm";
      name.replaceWith(input);
      input.focus();
      input.select();
      let done = false;
      const finish = async (save: boolean) => {
        if (done) return;
        done = true;
        const next = input.value.trim();
        if (save && next && next !== f.name) await api.renameFilter(f.id, next);
        await refresh();
      };
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") void finish(true);
        if (e.key === "Escape") void finish(false);
      });
      input.addEventListener("blur", () => void finish(true));
    });

    const del = el("button", LINK_BTN, "Delete");
    del.addEventListener("click", async () => {
      if (!confirm(`Delete "${f.name}"?`)) return;
      await api.deleteFilter(f.id);
      await refresh();
    });

    const actions = el("div", "flex items-center gap-3");
    actions.append(editBtn, rename, del, toggle(f.subscribed, async (next) => {
      await api.setFilterSubscribed(f.id, next);
      await refresh();
    }));
    row.append(info, actions);
    return row;
  }

  function section(title: string, filters: SavedFilter[]): HTMLElement {
    const s = el("section", "flex flex-col gap-2");
    s.appendChild(el("h4", SECTION_LABEL, `${title} · ${filters.length}`));
    for (const f of filters) s.appendChild(card(f));
    return s;
  }

  async function refresh() {
    let filters: SavedFilter[];
    try {
      filters = await api.listFilters();
    } catch (err) {
      body.replaceChildren(el("p", "text-danger text-sm", `Couldn't load subscriptions: ${(err as Error).message}`));
      return;
    }
    body.replaceChildren();
    const subscribed = filters.filter((f) => f.subscribed);
    const saved = filters.filter((f) => !f.subscribed);

    if (filters.length === 0) {
      const empty = el("div", "flex flex-col items-center gap-3 rounded-lg border border-dashed border-line py-14 px-4 text-center");
      empty.appendChild(el("p", "m-0 text-sm font-medium", "No subscriptions yet"));
      empty.appendChild(el("p", "m-0 text-sm text-muted", "Follow a search and its new scenes will appear in your Feed."));
      const btn = el("button", PRIMARY_BTN, "New subscription");
      btn.addEventListener("click", startNew);
      empty.appendChild(btn);
      body.appendChild(empty);
      return;
    }
    if (subscribed.length) body.appendChild(section("Active", subscribed));
    else body.appendChild(el("p", "text-muted text-sm", "Nothing active. Resume a paused search below, or add a new one."));
    if (saved.length) {
      const s = section("Paused", saved);
      s.classList.add("opacity-80");
      body.appendChild(s);
    }
  }

  const header = el("div", "flex items-start justify-between gap-4 flex-wrap");
  const titles = el("div", "flex flex-col gap-1");
  titles.appendChild(el("h3", "m-0 text-base font-semibold", "Subscriptions"));
  titles.appendChild(el("p", "m-0 text-sm text-muted", "Your saved searches. Active ones feed new scenes into the Feed tab."));
  const add = el("button", PRIMARY_BTN, "+ New subscription");
  add.addEventListener("click", startNew);
  header.append(titles, add);

  container.append(header, body);
  void refresh();
  return container;
}
