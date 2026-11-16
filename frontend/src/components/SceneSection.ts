import { api, type Scene, type SceneStatus } from "../api.js";
import { renderSceneCard, hidePreview } from "./SceneCard.js";
import { renderPagination } from "./Pagination.js";
import { iconCheckCircle } from "../icons.js";
import { getState } from "../viewState.js";

function textState(message: string): HTMLElement {
  const wrap = document.createElement("div");
  wrap.className = "col-span-full flex items-center justify-center py-12 text-text-faint";
  wrap.title = message;
  wrap.appendChild(iconCheckCircle());
  return wrap;
}

function renderSpinnerIcon(): HTMLElement {
  const spinner = document.createElement("div");
  spinner.className = "w-6 h-6 rounded-full border-2 border-muted/30 border-t-accent animate-spin";
  return spinner;
}

function renderSpinner(): HTMLElement {
  const wrap = document.createElement("div");
  wrap.className = "col-span-full flex items-center justify-center py-12";
  wrap.appendChild(renderSpinnerIcon());
  return wrap;
}

export function renderSceneSection(opts: {
  perPage: number;
  fetchPage: (page: number, refresh?: boolean) => Promise<{ count: number; scenes: Scene[]; approximateCount?: boolean }>;
  emptyMessage: string;
  onCount?: (count: number) => void;
  stateKey?: string;
}): { element: HTMLElement; reset: () => void; refresh: () => Promise<void> } {
  const element = document.createElement("div");
  const grid = document.createElement("div");
  grid.className = "grid gap-4 grid-cols-[repeat(auto-fill,minmax(240px,1fr))]";
  const paginationEl = document.createElement("div");
  element.appendChild(grid);
  element.appendChild(paginationEl);

  const pageState = opts.stateKey ? getState(`page:${opts.stateKey}`, { page: 1 }) : { page: 1 };
  let page = pageState.page;
  let statuses: Record<string, SceneStatus> = {};
  let currentScenes: Scene[] = [];

  let seq = 0;
  const cards = new Map<string, HTMLElement>();

  function buildCard(scene: Scene): HTMLElement {
    const card = renderSceneCard(scene, statuses[scene.id], () => refreshOneStatus(scene.id), () => {
      currentScenes = currentScenes.filter((s) => s.id !== scene.id);
      cards.delete(scene.id);
      card.remove();
    });
    cards.set(scene.id, card);
    return card;
  }

  function renderGrid() {
    hidePreview();
    cards.clear();
    grid.replaceChildren(...currentScenes.map(buildCard));
  }

  function patchCards(ids: Set<string>) {
    if (ids.size === 0) return;
    hidePreview();
    for (const scene of currentScenes) {
      if (ids.has(scene.id)) cards.get(scene.id)?.replaceWith(buildCard(scene));
    }
  }

  async function refreshOneStatus(id: string) {
    const my = seq;
    const result = await api.sceneStatuses([id]);
    if (my !== seq) return;
    statuses = { ...statuses, ...result };
    patchCards(new Set([id]));
  }

  async function refreshStatuses() {
    const my = seq;
    const ids = currentScenes.map((s) => s.id);
    if (ids.length === 0) return;
    const next = await api.sceneStatuses(ids);
    if (my !== seq) return;
    const changed = new Set(ids.filter((id) => JSON.stringify(next[id]) !== JSON.stringify(statuses[id])));
    statuses = next;
    patchCards(changed);
  }

  function updatePagination(count: number, approximate: boolean) {
    paginationEl.innerHTML = "";
    paginationEl.appendChild(
      renderPagination({
        page,
        perPage: opts.perPage,
        count,
        approximate,
        onPage: (p) => {
          page = p;
          pageState.page = p;
          void load();
        },
      }),
    );
    opts.onCount?.(count);
  }

  async function load(bypassCache = false) {
    const mine = ++seq;
    const isFirstLoad = grid.children.length === 0;
    if (isFirstLoad) {
      grid.replaceChildren(renderSpinner());
    } else {
      grid.classList.add("animate-breathe", "pointer-events-none");
    }

    try {
      const { count, scenes, approximateCount } = await opts.fetchPage(page, bypassCache);
      if (mine !== seq) return;
      statuses = {};
      currentScenes = scenes;

      if (scenes.length === 0 && page > 1 && !approximateCount) {
        page = Math.max(1, Math.ceil(count / opts.perPage));
        pageState.page = page;
        return load(bypassCache);
      }

      if (scenes.length === 0 && page === 1) {
        grid.innerHTML = "";
        grid.appendChild(textState(opts.emptyMessage));
        paginationEl.innerHTML = "";
        opts.onCount?.(0);
        return;
      }
      updatePagination(count, !!approximateCount);
      renderGrid();
      void refreshStatuses();

      const hasNextPage = approximateCount || page * opts.perPage < count;
      if (!bypassCache && hasNextPage) {
        void opts.fetchPage(page + 1).catch(() => {});
      }
    } finally {
      if (mine === seq) grid.classList.remove("animate-breathe", "pointer-events-none");
    }
  }

  function reset() {
    page = pageState.page = 1;
    void load();
  }

  async function refresh() {
    await load(true);
  }

  void load();
  return { element, reset, refresh };
}
