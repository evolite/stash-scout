import { api, type Scene, type SceneStatus } from "../api.js";
import { renderSceneCard, hidePreview } from "./SceneCard.js";
import { renderPagination } from "./Pagination.js";
import { iconCheckCircle } from "../icons.js";

function textState(message: string): HTMLElement {
  const wrap = document.createElement("div");
  wrap.className = "col-span-full flex items-center justify-center py-12 text-text-faint";
  wrap.title = message;
  wrap.appendChild(iconCheckCircle());
  return wrap;
}

// Only shown on a section's very first load, when there's no prior content to
// keep on screen — a small centered spinner instead of placeholder cards that
// just get thrown away once real data lands.
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

// A self-contained paginated scene grid — used by Feed/Trending (WatchedView)
// and the Performers tab, each with their own page cursor and status polling.
export function renderSceneSection(opts: {
  perPage: number;
  fetchPage: (page: number, refresh?: boolean) => Promise<{ count: number; scenes: Scene[]; approximateCount?: boolean }>;
  emptyMessage: string;
  onCount?: (count: number) => void;
}): { element: HTMLElement; reset: () => void; refresh: () => Promise<void> } {
  const element = document.createElement("div");
  const grid = document.createElement("div");
  grid.className = "grid gap-4 grid-cols-[repeat(auto-fill,minmax(240px,1fr))]";
  const paginationEl = document.createElement("div");
  element.appendChild(grid);
  element.appendChild(paginationEl);

  let page = 1;
  let statuses: Record<string, SceneStatus> = {};
  let pollTimer: ReturnType<typeof setInterval> | undefined;
  // Set on every card action so polling keeps running long enough for the
  // backend's retry-with-backoff (up to ~15s) to resolve.
  let pollUntil = 0;
  // The single source of truth for what's currently shown — status refreshes
  // (triggered by any card's Add/Monitor click) re-render from this, so an
  // ignored scene needs to actually leave this list, not just its DOM node.
  // Removing only the node let a later refreshStatuses() call (which closed
  // over the original fetch's full array) redraw the whole grid and bring
  // already-ignored cards right back.
  let currentScenes: Scene[] = [];

  function renderGrid() {
    hidePreview();
    grid.innerHTML = "";
    for (const scene of currentScenes) {
      const card = renderSceneCard(scene, statuses[scene.id], (optimistic) => refreshOneStatus(scene.id, optimistic), () => {
        currentScenes = currentScenes.filter((s) => s.id !== scene.id);
        card.remove();
      });
      grid.appendChild(card);
    }
  }

  function schedulePolling() {
    clearInterval(pollTimer);
    const anyDownloading = Object.values(statuses).some((s) => s.kind === "downloading");
    if (anyDownloading || Date.now() < pollUntil) {
      pollTimer = setInterval(refreshStatuses, 2000);
    }
  }

  // A card action (Add/Monitor/Unmonitor) only needs its own scene's status
  // re-checked, not a full re-fetch of every visible card's status — that
  // full-page-wide `sceneStatuses` call fans out to up to 2 sequential local
  // Stash lookups per scene, and re-running it on every single click was what
  // made "adding something" feel slow (16 cards' worth of lookups per click).
  // `optimistic`, when passed, is applied immediately (async request-reply:
  // the backend mutation runs — and retries — in the background).
  async function refreshOneStatus(id: string, optimistic?: SceneStatus) {
    if (optimistic) {
      statuses = { ...statuses, [id]: optimistic };
      renderGrid();
    }
    pollUntil = Date.now() + 30000;
    schedulePolling();
    const result = await api.sceneStatuses([id]);
    statuses = { ...statuses, ...result };
    renderGrid();
    schedulePolling();
  }

  async function refreshStatuses() {
    statuses = await api.sceneStatuses(currentScenes.map((s) => s.id));
    renderGrid();
    schedulePolling();
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
          load();
        },
      }),
    );
    opts.onCount?.(count);
  }

  // First load has nothing on screen yet, so show a spinner. Every later load
  // (pagination, window switch, refresh) keeps the current cards visible,
  // just breathing (a slow pulse), instead of tearing them out for
  // placeholders that would only get thrown away a moment later once the
  // real results land. The try/finally is load-bearing — without it, a
  // failed fetch (a transient StashDB error, say) leaves the grid pulsing
  // forever with no way to clear it.
  async function load(bypassCache = false) {
    clearInterval(pollTimer);
    const isFirstLoad = grid.children.length === 0;
    if (isFirstLoad) {
      grid.replaceChildren(renderSpinner());
    } else {
      grid.classList.add("animate-breathe", "pointer-events-none");
    }

    try {
      const { count, scenes, approximateCount } = await opts.fetchPage(page, bypassCache);
      statuses = {};
      currentScenes = scenes;

      if (scenes.length === 0 && page === 1) {
        grid.innerHTML = "";
        grid.appendChild(textState(opts.emptyMessage));
        paginationEl.innerHTML = "";
        opts.onCount?.(0);
        return;
      }
      updatePagination(count, !!approximateCount);
      renderGrid();
      refreshStatuses();
    } finally {
      grid.classList.remove("animate-breathe", "pointer-events-none");
    }
  }

  function reset() {
    page = 1;
    load();
  }

  async function refresh() {
    await load(true);
  }

  load();
  return { element, reset, refresh };
}
