import { api, type Scene, type SceneStatus } from "../api.js";
import { renderSceneCard } from "../components/SceneCard.js";
import { renderSkeletonGrid } from "../components/SkeletonGrid.js";

const PER_PAGE = 25;

function paginationBtnClass(): string {
  return "bg-secondary text-white border-0 px-2.5 py-1.5 rounded hover:bg-surface-hover disabled:opacity-50 disabled:cursor-default";
}

function textState(message: string): HTMLElement {
  const p = document.createElement("p");
  p.className = "text-muted text-sm";
  p.textContent = message;
  return p;
}

export function renderFavoritesView(): HTMLElement {
  const container = document.createElement("div");

  const heading = document.createElement("h3");
  heading.className = "text-base font-semibold mb-1";
  heading.textContent = "Favorites";
  const note = document.createElement("p");
  note.className = "text-muted text-xs";
  note.textContent = "Scenes from your favorited StashDB performers that aren't already in Stash or Whisparr.";
  const grid = document.createElement("div");
  grid.className = "grid gap-4 grid-cols-[repeat(auto-fill,minmax(240px,1fr))]";
  const paginationTop = document.createElement("div");
  const paginationBottom = document.createElement("div");
  container.appendChild(heading);
  container.appendChild(note);
  container.appendChild(paginationTop);
  container.appendChild(grid);
  container.appendChild(paginationBottom);

  let page = 1;
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
    pag.className = "flex gap-1 my-4";

    const prev = document.createElement("button");
    prev.className = paginationBtnClass();
    prev.textContent = "Prev";
    prev.disabled = page <= 1;
    prev.addEventListener("click", () => {
      page -= 1;
      loadFeed();
    });
    pag.appendChild(prev);

    const label = document.createElement("span");
    label.className = "px-2 py-1.5";
    label.textContent = `Page ${page}${approximate ? "" : ` / ${totalPages}`} (${approximate ? "~" : ""}${count} scenes)`;
    pag.appendChild(label);

    const next = document.createElement("button");
    next.className = paginationBtnClass();
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
    grid.replaceChildren(...Array.from(renderSkeletonGrid().children));
    try {
      const { count, scenes, approximateCount } = await api.favoritesFeed(page, PER_PAGE);
      statuses = {};
      if (scenes.length === 0 && page === 1) {
        grid.innerHTML = "";
        grid.appendChild(textState("Nothing new from your favorited performers right now."));
        paginationTop.innerHTML = "";
        paginationBottom.innerHTML = "";
        return;
      }
      renderPagination(paginationTop, count, !!approximateCount, scenes.length);
      renderPagination(paginationBottom, count, !!approximateCount, scenes.length);
      renderGrid(scenes);
      refreshStatuses(scenes);
    } catch (err) {
      grid.innerHTML = "";
      grid.appendChild(textState(`Failed to load: ${(err as Error).message}`));
    }
  }

  loadFeed();
  return container;
}
