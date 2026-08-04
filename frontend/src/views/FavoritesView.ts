import { api, type Scene, type SceneStatus } from "../api.js";
import { renderSceneCard } from "../components/SceneCard.js";

const PER_PAGE = 25;

export function renderFavoritesView(): HTMLElement {
  const container = document.createElement("div");

  const heading = document.createElement("h3");
  heading.textContent = "Favorites";
  const note = document.createElement("p");
  note.style.cssText = "color:var(--muted);font-size:0.85rem";
  note.textContent = "Scenes from your favorited StashDB performers that aren't already in Stash or Whisparr.";
  const grid = document.createElement("div");
  grid.className = "SceneGrid";
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
    grid.innerHTML = "<p>Loading…</p>";
    try {
      const { count, scenes, approximateCount } = await api.favoritesFeed(page, PER_PAGE);
      statuses = {};
      if (scenes.length === 0 && page === 1) {
        grid.innerHTML = "<p>Nothing new from your favorited performers right now.</p>";
        paginationTop.innerHTML = "";
        paginationBottom.innerHTML = "";
        return;
      }
      renderPagination(paginationTop, count, !!approximateCount, scenes.length);
      renderPagination(paginationBottom, count, !!approximateCount, scenes.length);
      renderGrid(scenes);
      refreshStatuses(scenes);
    } catch (err) {
      grid.innerHTML = `<p>Failed to load: ${(err as Error).message}</p>`;
    }
  }

  loadFeed();
  return container;
}
