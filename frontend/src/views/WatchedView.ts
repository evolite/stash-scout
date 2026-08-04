import { api, type Scene, type SceneStatus } from "../api.js";
import { renderSceneCard } from "../components/SceneCard.js";

const PER_PAGE = 25;

function emptyState(message: string, goToBrowse: () => void, buttonLabel: string): HTMLElement {
  const wrap = document.createElement("div");
  wrap.style.cssText = "text-align:center;padding:3rem 1rem;color:var(--muted)";
  const p = document.createElement("p");
  p.textContent = message;
  wrap.appendChild(p);
  const btn = document.createElement("button");
  btn.className = "btn";
  btn.textContent = buttonLabel;
  btn.addEventListener("click", goToBrowse);
  wrap.appendChild(btn);
  return wrap;
}

export function renderWatchedView(goToBrowse: () => void): HTMLElement {
  const container = document.createElement("div");
  container.innerHTML = "<p>Loading…</p>";

  let page = 1;

  async function render() {
    const filters = await api.listFilters();
    if (filters.length === 0) {
      container.innerHTML = "";
      container.appendChild(emptyState("You haven't saved any filters yet.", goToBrowse, "Create Your First Filter"));
      return;
    }
    if (!filters.some((f) => f.watched)) {
      container.innerHTML = "";
      container.appendChild(
        emptyState(
          "No saved filters are watched yet — check the box next to a filter in Browse to add it here.",
          goToBrowse,
          "Go to Browse",
        ),
      );
      return;
    }

    container.innerHTML = "";
    const feedHeading = document.createElement("h3");
    feedHeading.textContent = "Feed";
    const grid = document.createElement("div");
    grid.className = "SceneGrid";
    const paginationTop = document.createElement("div");
    const paginationBottom = document.createElement("div");
    container.appendChild(feedHeading);
    container.appendChild(paginationTop);
    container.appendChild(grid);
    container.appendChild(paginationBottom);

    let statuses: Record<string, SceneStatus> = {};

    async function refreshStatuses(scenes: Scene[]) {
      statuses = await api.sceneStatuses(scenes.map((s) => s.id));
      renderGrid(scenes);
    }

    function renderGrid(scenes: Scene[]) {
      grid.innerHTML = "";
      for (const scene of scenes) {
        const card = renderSceneCard(scene, statuses[scene.id], () => refreshStatuses(scenes), () => card.remove());
        grid.appendChild(card);
      }
    }

    function renderPagination(target: HTMLElement, count: number, approximate: boolean, sceneCountOnPage: number) {
      target.innerHTML = "";
      const totalPages = Math.max(1, Math.ceil(count / PER_PAGE));
      const pag = document.createElement("div");
      pag.className = "Pagination";

      const prev = document.createElement("button");
      prev.textContent = "Prev";
      prev.disabled = page <= 1;
      prev.addEventListener("click", () => {
        page -= 1;
        loadFeed();
      });
      pag.appendChild(prev);

      const label = document.createElement("span");
      label.style.padding = "0.35rem 0.5rem";
      label.textContent = `Page ${page}${approximate ? "" : ` / ${totalPages}`} (${approximate ? "~" : ""}${count} scenes)`;
      pag.appendChild(label);

      const next = document.createElement("button");
      next.textContent = "Next";
      next.disabled = approximate ? sceneCountOnPage < PER_PAGE : page >= totalPages;
      next.addEventListener("click", () => {
        page += 1;
        loadFeed();
      });
      pag.appendChild(next);

      target.appendChild(pag);
    }

    async function loadFeed() {
      grid.innerHTML = "<p>Loading feed…</p>";
      const { count, scenes, approximateCount } = await api.watchedFeed(page, PER_PAGE);
      statuses = {};
      renderPagination(paginationTop, count, !!approximateCount, scenes.length);
      renderPagination(paginationBottom, count, !!approximateCount, scenes.length);
      renderGrid(scenes);
      refreshStatuses(scenes);
    }

    loadFeed();
  }

  render();
  return container;
}
