import { api, type SavedFilter, type SceneFilter } from "../api.js";
import type { Tab } from "../components/Navbar.js";
import { PRIMARY_BTN } from "../components/filterControls.js";
import { getState, setSubscriptionMode } from "../viewState.js";

const CARD = "bg-surface border border-line rounded-lg";
const CHIP = "rounded-full bg-surface-3 px-2 py-0.5 text-[11px] text-muted";

function el(tag: string, className: string, text?: string): HTMLElement {
  const e = document.createElement(tag);
  e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}

const tip = (e: HTMLElement, text: string) => ((e.title = text), e);

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

const ICONS = {
  bell: "M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 01-3.4 0",
  download: "M12 3v12M7 10l5 5 5-5M5 21h14",
  del: "M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6",
};

// 28px icon button; `on` (when given) makes it a toggle: blue icon (bell also filled) when on, grey when off.
function iconBtn(kind: keyof typeof ICONS, title: string, onClick: () => void, opts: { on?: boolean; danger?: boolean } = {}): HTMLElement {
  const toggleable = opts.on !== undefined;
  const color = `bg-transparent hover:bg-surface-3 ${opts.on ? "text-accent" : `text-muted ${opts.danger ? "hover:text-danger" : "hover:text-text"}`}`;
  const b = el("button", `grid place-items-center shrink-0 w-7 h-7 rounded-md border-0 p-0 transition-colors ${color}`);
  b.title = title;
  b.setAttribute("aria-label", title);
  if (toggleable) b.setAttribute("aria-pressed", String(opts.on));
  b.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="${opts.on && kind === "bell" ? "currentColor" : "none"}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="${ICONS[kind]}"/></svg>`;
  b.addEventListener("click", onClick);
  return b;
}

const SUBSCRIBE_TIP = (on: boolean) =>
  on ? "Subscribed — new scenes appear in the Feed tab. Click to pause." : "Paused — click to subscribe and show new scenes in the Feed tab.";
const MONITOR_TIP = (on: boolean) =>
  `Auto-monitor ${on ? "ON" : "OFF"} — every hour, new scenes (last 7 days, max 25) are added to Whisparr and monitored for download. Only runs while subscribed. Click to turn ${on ? "off" : "on"}.`;

export function renderSubscriptionsView(navigate: (tab: Tab) => void): HTMLElement {
  const container = el("div", "flex flex-col gap-5 max-w-3xl");
  const body = el("div", "flex flex-col gap-5");

  // Subscribe (bell) + auto-monitor (download) toggles, shared by filter rows and Favorites.
  function toggles(
    subscribed: boolean,
    autoMonitor: boolean,
    setSubscribed: (n: boolean) => Promise<unknown>,
    setAutoMonitor: (n: boolean) => Promise<unknown>,
  ): HTMLElement[] {
    const go = (set: (n: boolean) => Promise<unknown>, next: boolean) => async () => {
      await set(next);
      await refresh();
    };
    return [
      iconBtn("bell", SUBSCRIBE_TIP(subscribed), go(setSubscribed, !subscribed), { on: subscribed }),
      iconBtn("download", MONITOR_TIP(autoMonitor), go(setAutoMonitor, !autoMonitor), { on: autoMonitor }),
    ];
  }

  // Active rows get an accent edge + tinted background.
  const rowClass = (active: boolean) =>
    `${CARD} px-3 py-3 flex items-start gap-3 border-l-4 ${active ? "border-l-accent bg-accent/5" : "border-l-transparent opacity-80"}`;

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
    const row = el("div", rowClass(f.subscribed));
    row.dataset.id = f.id;
    const grip = el("span", "shrink-0 cursor-grab text-text-faint hover:text-text select-none leading-none mt-0.5", "⠿");
    grip.dataset.grip = "";
    grip.title = "Drag to reorder";
    const info = el("div", "flex-1 min-w-0 flex flex-col gap-1.5");
    const name = el("button", "self-start max-w-full truncate bg-transparent border-0 p-0 text-left text-sm font-semibold text-text hover:text-link", f.name);
    name.title = "Click to edit this subscription's filters and name";
    name.addEventListener("click", () => edit(f));
    const chips = el("div", "flex flex-wrap gap-1.5");
    for (const s of summarise(f.filter)) chips.appendChild(tip(el("span", CHIP, s), "Filter criteria saved with this subscription — click the name to see or change them."));
    info.append(name, chips);

    const del = iconBtn("del", "Delete this subscription", async () => {
      if (!confirm(`Delete "${f.name}"?`)) return;
      await api.deleteFilter(f.id);
      await refresh();
    }, { danger: true });

    row.append(
      grip,
      info,
      ...toggles(f.subscribed, f.autoAdd, (n) => api.setFilterSubscribed(f.id, n), (n) => api.setFilterAutoAdd(f.id, n)),
      del,
    );
    return row;
  }

  // Favorites is a synthetic feed source, not a filters row — a pinned pseudo-row
  // whose two switches are server settings.
  function favoritesCard(subscribed: boolean, autoAdd: boolean): HTMLElement {
    const row = el("div", rowClass(subscribed));
    const info = el("div", "flex-1 min-w-0 flex flex-col gap-1.5");
    info.appendChild(tip(el("span", "self-start text-sm font-semibold", "Favorites"), "Built-in source: new scenes from performers you've favorited on StashDB. Not a saved search, so it can't be edited or deleted."));
    const chips = el("div", "flex flex-wrap gap-1.5");
    chips.appendChild(el("span", CHIP, "new scenes from your StashDB favorite performers"));
    info.appendChild(chips);
    row.append(
      el("span", "shrink-0 w-3"), // aligns with the drag grip on filter rows
      info,
      ...toggles(subscribed, autoAdd, (n) => api.setFavoritesSubscribed(n), (n) => api.setFavoritesAutoAdd(n)),
      el("span", "shrink-0 w-7"), // aligns with the delete button on filter rows
    );
    return row;
  }

  // Native drag-and-drop on the grip handle; saves the DOM order on drop.
  function enableReorder(cards: HTMLElement) {
    let dragged: HTMLElement | null = null;
    cards.addEventListener("dragover", (e) => {
      if (!dragged) return;
      e.preventDefault();
      const after = [...cards.children].filter((c) => c !== dragged).find((c) => {
        const r = c.getBoundingClientRect();
        return e.clientY < r.top + r.height / 2;
      });
      cards.insertBefore(dragged, after ?? null);
    });
    cards.addEventListener("drop", (e) => e.preventDefault());
    for (const c of cards.children as unknown as Iterable<HTMLElement>) {
      const grip = c.querySelector<HTMLElement>("[data-grip]")!;
      grip.addEventListener("mousedown", () => (c.draggable = true));
      c.addEventListener("dragstart", (e) => {
        dragged = c;
        e.dataTransfer!.effectAllowed = "move";
        c.classList.add("opacity-50");
      });
      c.addEventListener("dragend", async () => {
        c.draggable = false;
        c.classList.remove("opacity-50");
        dragged = null;
        await api.reorderFilters([...cards.children].map((x) => (x as HTMLElement).dataset.id!));
      });
    }
  }

  async function refresh() {
    let filters: SavedFilter[];
    let favoritesSubscribed: boolean;
    let favoritesAutoAdd: boolean;
    try {
      [filters, { favoritesSubscribed, favoritesAutoAdd }] = await Promise.all([api.listFilters(), api.getConfig()]);
    } catch (err) {
      body.replaceChildren(el("p", "text-danger text-sm", `Couldn't load subscriptions: ${(err as Error).message}`));
      return;
    }
    body.replaceChildren();
    const list = el("div", "flex flex-col gap-2");
    list.append(favoritesCard(favoritesSubscribed, favoritesAutoAdd));
    const cards = el("div", "flex flex-col gap-2");
    for (const f of filters) cards.appendChild(card(f));
    enableReorder(cards);
    list.appendChild(cards);
    body.appendChild(list);
    if (filters.length === 0) {
      const empty = el("div", "flex flex-col items-center gap-3 rounded-lg border border-dashed border-line py-10 px-4 text-center");
      empty.appendChild(el("p", "m-0 text-sm font-medium", "No saved searches yet"));
      empty.appendChild(el("p", "m-0 text-sm text-muted", "Follow a search and its new scenes will appear in your Feed."));
      const btn = el("button", PRIMARY_BTN, "New subscription");
      btn.addEventListener("click", startNew);
      empty.appendChild(btn);
      body.appendChild(empty);
    }
  }

  const header = el("div", "flex items-start justify-between gap-4 flex-wrap");
  const titles = el("div", "flex flex-col gap-1");
  titles.appendChild(el("h3", "m-0 text-base font-semibold", "Subscriptions"));
  titles.appendChild(el("p", "m-0 text-sm text-muted", "Your saved searches. Subscribed ones feed new scenes into the Feed tab."));
  const add = tip(el("button", PRIMARY_BTN, "+ New subscription"), "Open Browse and build a search to subscribe to");
  add.addEventListener("click", startNew);
  header.append(titles, add);

  container.append(header, body);
  void refresh();
  return container;
}
