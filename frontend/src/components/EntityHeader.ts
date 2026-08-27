import type { PerformerDetails, StudioDetails } from "../api.js";

// The looked-up performer/studio shown above its scene grid: image + name + a
// compact fact grid. Used by PerformersView and StudiosView.

function chipRow(label: string, values: string[]): HTMLElement | null {
  if (values.length === 0) return null;
  const row = document.createElement("div");
  row.className = "flex flex-wrap items-center gap-1.5";
  const l = document.createElement("span");
  l.className = "text-xs text-text-faint mr-0.5";
  l.textContent = label;
  row.appendChild(l);
  for (const v of values) {
    const c = document.createElement("span");
    c.className = "text-xs bg-surface-3 text-muted rounded px-1.5 py-0.5";
    c.textContent = v;
    row.appendChild(c);
  }
  return row;
}

function linkRow(urls: { url: string; site: { name: string } | null }[]): HTMLElement | null {
  if (urls.length === 0) return null;
  const row = document.createElement("div");
  row.className = "flex flex-wrap items-center gap-1.5";
  const l = document.createElement("span");
  l.className = "text-xs text-text-faint mr-0.5";
  l.textContent = "Links";
  row.appendChild(l);
  for (const u of urls) {
    const a = document.createElement("a");
    a.href = u.url;
    a.target = "_blank";
    a.rel = "noopener";
    a.className = "text-xs bg-surface-3 text-link rounded px-1.5 py-0.5 hover:bg-surface-2";
    a.textContent = u.site?.name ?? new URL(u.url).hostname.replace(/^www\./, "");
    row.appendChild(a);
  }
  return row;
}

function factGrid(facts: [string, string | null | undefined][]): HTMLElement | null {
  const rows = facts.filter(([, v]) => v != null && v !== "");
  if (rows.length === 0) return null;
  const dl = document.createElement("dl");
  dl.className = "grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-sm sm:grid-cols-[max-content_1fr_max-content_1fr] sm:gap-x-6";
  for (const [k, v] of rows) {
    const dt = document.createElement("dt");
    dt.className = "text-muted";
    dt.textContent = k;
    const dd = document.createElement("dd");
    dd.className = "text-text";
    dd.textContent = String(v);
    dl.appendChild(dt);
    dl.appendChild(dd);
  }
  return dl;
}

type ImageMode = "portrait" | "logo";

function shell(
  imageUrl: string | undefined,
  name: string,
  stashdbUrl: string,
  sub: string | null,
  mode: ImageMode,
): { wrap: HTMLElement; body: HTMLElement } {
  const wrap = document.createElement("div");
  wrap.className = "flex flex-col gap-5 rounded-lg border border-line bg-surface p-5 sm:flex-row";

  const frame = document.createElement("div");
  frame.className =
    mode === "portrait"
      ? "w-32 shrink-0 self-start overflow-hidden rounded-md bg-navbar sm:w-40"
      : "flex h-28 w-40 shrink-0 items-center justify-center overflow-hidden rounded-md bg-navbar p-3 sm:w-48";
  if (imageUrl) {
    const img = document.createElement("img");
    img.src = imageUrl;
    img.alt = name;
    img.loading = "lazy";
    img.decoding = "async";
    img.className =
      mode === "portrait" ? "w-full aspect-[2/3] object-cover object-top" : "max-h-full max-w-full object-contain";
    frame.appendChild(img);
  } else if (mode === "portrait") {
    frame.classList.add("aspect-[2/3]");
  }
  wrap.appendChild(frame);

  const body = document.createElement("div");
  body.className = "flex min-w-0 flex-1 flex-col gap-3";

  const titleRow = document.createElement("div");
  titleRow.className = "flex flex-wrap items-baseline gap-x-3 gap-y-1";
  const h = document.createElement("h2");
  h.className = "text-xl font-semibold leading-tight";
  h.textContent = name;
  titleRow.appendChild(h);
  if (sub) {
    const s = document.createElement("span");
    s.className = "text-sm text-muted";
    s.textContent = sub;
    titleRow.appendChild(s);
  }
  const link = document.createElement("a");
  link.href = stashdbUrl;
  link.target = "_blank";
  link.rel = "noopener";
  link.className = "text-xs text-text-faint hover:text-link";
  link.textContent = "View on StashDB ↗";
  titleRow.appendChild(link);
  body.appendChild(titleRow);
  wrap.appendChild(body);

  return { wrap, body };
}

function titleCase(v: string | null): string | null {
  return v ? v[0] + v.slice(1).toLowerCase() : null;
}

function heightDisplay(cm: number): string {
  const inches = Math.round(cm / 2.54);
  return `${cm} cm · ${Math.floor(inches / 12)}′${inches % 12}″`;
}

function measurements(p: PerformerDetails): string | null {
  if (!p.band_size || !p.cup_size) return null;
  const rest = [p.waist_size, p.hip_size].filter(Boolean).join("-");
  return `${p.band_size}${p.cup_size}${rest ? `-${rest}` : ""}`;
}

export function renderPerformerHeader(p: PerformerDetails): HTMLElement {
  const { wrap, body } = shell(
    p.images[0]?.url,
    p.name,
    `https://stashdb.org/performers/${p.id}`,
    p.disambiguation,
    "portrait",
  );

  const career =
    p.career_start_year != null ? `${p.career_start_year}–${p.career_end_year ?? "present"}` : null;

  const grid = factGrid([
    ["Gender", titleCase(p.gender)],
    ["Age", p.age != null ? String(p.age) : null],
    ["Born", p.birth_date],
    ["Country", p.country],
    ["Ethnicity", titleCase(p.ethnicity)],
    ["Hair", titleCase(p.hair_color)],
    ["Eyes", titleCase(p.eye_color)],
    ["Height", p.height ? heightDisplay(p.height) : null],
    ["Measurements", measurements(p)],
    ["Career", career],
    ["Scenes", `${p.scene_count} on StashDB`],
  ]);
  if (grid) body.appendChild(grid);

  const aliases = chipRow("Also known as", p.aliases);
  if (aliases) body.appendChild(aliases);
  const links = linkRow(p.urls);
  if (links) body.appendChild(links);

  return wrap;
}

export function renderStudioHeader(s: StudioDetails): HTMLElement {
  const { wrap, body } = shell(
    s.images[0]?.url,
    s.name,
    `https://stashdb.org/studios/${s.id}`,
    null,
    "logo",
  );

  const grid = factGrid([["Parent studio", s.parent?.name]]);
  if (grid) body.appendChild(grid);

  const aliases = chipRow("Also known as", s.aliases);
  if (aliases) body.appendChild(aliases);
  const links = linkRow(s.urls);
  if (links) body.appendChild(links);

  return wrap;
}
