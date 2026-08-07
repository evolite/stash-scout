const BTN_BASE = "border-0 px-2.5 py-1.5 rounded min-w-[36px] disabled:opacity-50 disabled:cursor-default";
const BTN_INACTIVE = BTN_BASE + " bg-secondary text-white hover:bg-surface-hover";
const BTN_ACTIVE = BTN_BASE + " bg-accent text-white";

const WINDOW_SIZE = 5;

export function renderPagination(opts: {
  page: number;
  perPage: number;
  count: number;
  approximate: boolean;
  onPage: (page: number) => void;
}): HTMLElement {
  const { page, perPage, count, approximate, onPage } = opts;
  const knownTotalPages = Math.max(1, Math.ceil(count / perPage));
  // `approximate` (server-side "not confirmed exhausted yet") is the only signal
  // worth trusting here — this app's feeds filter/merge scenes server-side, so a
  // short page doesn't mean there's nothing more, just that this round didn't
  // turn up a full one. While unexhausted, assume there's room for a full
  // window ahead; once the server confirms exhaustion, size exactly.
  const totalPages = approximate ? Math.max(knownTotalPages, page + WINDOW_SIZE - 1) : knownTotalPages;

  const wrap = document.createElement("div");
  wrap.className = "flex flex-col items-end gap-1.5 mt-3";

  const label = document.createElement("div");
  label.className = "text-muted text-xs";
  label.textContent = approximate ? `Page ${page} · ~${count} scenes` : `Page ${page} of ${totalPages} · ${count} scenes`;
  wrap.appendChild(label);

  const bar = document.createElement("div");
  bar.className = "flex items-center gap-1 flex-wrap";

  function btn(label: string, target: number, disabled: boolean, active = false): HTMLButtonElement {
    const b = document.createElement("button");
    b.className = active ? BTN_ACTIVE : BTN_INACTIVE;
    b.textContent = label;
    b.disabled = disabled;
    if (!disabled) b.addEventListener("click", () => onPage(target));
    return b;
  }

  bar.appendChild(btn("«", 1, page <= 1));
  bar.appendChild(btn("‹", page - 1, page <= 1));

  let start = Math.max(1, page - Math.floor(WINDOW_SIZE / 2));
  const end = Math.min(totalPages, start + WINDOW_SIZE - 1);
  start = Math.max(1, end - WINDOW_SIZE + 1);
  for (let p = start; p <= end; p++) {
    bar.appendChild(btn(String(p), p, false, p === page));
  }

  const nextDisabled = approximate ? false : page >= totalPages;
  bar.appendChild(btn("›", page + 1, nextDisabled));
  bar.appendChild(btn("»", totalPages, approximate || page >= totalPages));

  wrap.appendChild(bar);
  return wrap;
}
