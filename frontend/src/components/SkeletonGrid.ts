export function renderSkeletonGrid(count = 8): HTMLElement {
  const grid = document.createElement("div");
  grid.className = "grid gap-4 grid-cols-[repeat(auto-fill,minmax(240px,1fr))]";
  for (let i = 0; i < count; i++) {
    const ph = document.createElement("div");
    ph.className = "bg-surface rounded-lg shadow-card overflow-hidden animate-pulse h-[230px]";
    grid.appendChild(ph);
  }
  return grid;
}
