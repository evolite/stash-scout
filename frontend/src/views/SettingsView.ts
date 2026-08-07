import { api } from "../api.js";
import { iconClose } from "../icons.js";

const DOT_BASE = "inline-block w-[9px] h-[9px] rounded-full shrink-0";
const DOT_OK = DOT_BASE + " bg-success";
const DOT_BAD = DOT_BASE + " bg-danger";
const DOT_UNKNOWN = DOT_BASE + " bg-secondary";

function statusDot(ok: boolean | null): HTMLElement {
  const dot = document.createElement("span");
  dot.className = ok === null ? DOT_UNKNOWN : ok ? DOT_OK : DOT_BAD;
  return dot;
}

function setStatusDot(dot: HTMLElement, ok: boolean): void {
  dot.className = ok ? DOT_OK : DOT_BAD;
}

function fieldRow(label: string, opts: { type?: string; value?: string; placeholder?: string } = {}): { row: HTMLElement; input: HTMLInputElement } {
  const row = document.createElement("label");
  row.className = "SettingsField";
  const span = document.createElement("span");
  span.textContent = label;
  const input = document.createElement("input");
  input.type = opts.type ?? "text";
  input.value = opts.value ?? "";
  if (opts.placeholder) input.placeholder = opts.placeholder;
  row.appendChild(span);
  row.appendChild(input);
  return { row, input };
}

const CARD_BASE = "bg-surface rounded-lg p-3.5 flex flex-col gap-2";
const CARD_WIDE = CARD_BASE + " col-span-full";

function card(title: string, wide = false): { card: HTMLElement; header: HTMLElement; dot: HTMLElement } {
  const el = document.createElement("div");
  el.className = wide ? CARD_WIDE : CARD_BASE;
  const header = document.createElement("div");
  header.className = "flex items-center justify-between";
  const h = document.createElement("h4");
  h.className = "m-0 text-sm";
  h.textContent = title;
  const dot = statusDot(null);
  header.appendChild(h);
  header.appendChild(dot);
  el.appendChild(header);
  return { card: el, header, dot };
}

function footer(saveLabel = "Save"): { row: HTMLElement; save: HTMLButtonElement; note: HTMLElement } {
  const row = document.createElement("div");
  row.className = "flex items-center justify-between gap-2 mt-auto pt-1";
  const note = document.createElement("span");
  note.className = "text-xs text-muted";
  const save = document.createElement("button");
  save.className = "bg-accent text-white rounded px-2.5 py-1 text-xs hover:brightness-110 shrink-0";
  save.textContent = saveLabel;
  row.appendChild(note);
  row.appendChild(save);
  return { row, save, note };
}

export function renderSettingsView(): HTMLElement {
  const container = document.createElement("div");
  const loading = document.createElement("p");
  loading.className = "text-muted text-sm";
  loading.textContent = "Loading…";
  container.appendChild(loading);

  async function render() {
    const [cfg, settings, test] = await Promise.all([api.getConfig(), api.settings(), api.testSettings()]);
    container.innerHTML = "";

    const grid = document.createElement("div");
    grid.className = "grid gap-4 items-start grid-cols-[repeat(auto-fit,minmax(280px,1fr))]";
    container.appendChild(grid);

    // --- StashDB ---
    const stashdbC = card("StashDB");
    setStatusDot(stashdbC.dot, test.stashdb);
    const stashdbUrl = fieldRow("URL", { value: cfg.stashdbUrl });
    const stashdbKey = fieldRow("API Key", { type: "password", placeholder: cfg.stashdbApiKeySet ? "(unchanged)" : "not set" });
    stashdbC.card.appendChild(stashdbUrl.row);
    stashdbC.card.appendChild(stashdbKey.row);
    const stashdbF = footer();
    stashdbF.save.addEventListener("click", async () => {
      await api.updateConfig({ stashdbUrl: stashdbUrl.input.value, stashdbApiKey: stashdbKey.input.value });
      stashdbKey.input.value = "";
      await retest();
    });
    stashdbC.card.appendChild(stashdbF.row);
    grid.appendChild(stashdbC.card);

    // --- Local Stash ---
    const stashC = card("Local Stash");
    setStatusDot(stashC.dot, test.localStash);
    const stashGqlUrl = fieldRow("GraphQL URL", { value: cfg.localStashUrl, placeholder: "http://localhost:9999/graphql" });
    const stashRootUrl = fieldRow("Root URL", { value: cfg.localStashRootUrl, placeholder: "http://localhost:9999" });
    const stashKey = fieldRow("API Key", { type: "password", placeholder: cfg.localStashApiKeySet ? "(unchanged)" : "not set" });
    stashC.card.appendChild(stashGqlUrl.row);
    stashC.card.appendChild(stashRootUrl.row);
    stashC.card.appendChild(stashKey.row);
    const stashF = footer();
    if (!settings.localStashConfigured) stashF.note.textContent = "not configured";
    stashF.save.addEventListener("click", async () => {
      await api.updateConfig({
        localStashUrl: stashGqlUrl.input.value,
        localStashRootUrl: stashRootUrl.input.value,
        localStashApiKey: stashKey.input.value,
      });
      stashKey.input.value = "";
      await retest();
    });
    stashC.card.appendChild(stashF.row);
    grid.appendChild(stashC.card);

    // --- Whisparr ---
    const whisparrC = card("Whisparr");
    setStatusDot(whisparrC.dot, test.whisparr);
    const whisparrUrl = fieldRow("Base URL", { value: cfg.whisparrBaseUrl, placeholder: "http://localhost:6969" });
    const whisparrKey = fieldRow("API Key", { type: "password", placeholder: cfg.whisparrApiKeySet ? "(unchanged)" : "not set" });
    whisparrC.card.appendChild(whisparrUrl.row);
    whisparrC.card.appendChild(whisparrKey.row);

    const rootFolderRow = document.createElement("label");
    rootFolderRow.className = "SettingsField";
    const rootFolderSpan = document.createElement("span");
    rootFolderSpan.textContent = "Root folder";
    const rootFolderSelect = document.createElement("select");
    const rootFolderManual = document.createElement("input");
    rootFolderManual.value = cfg.whisparrRootFolderPath;
    rootFolderManual.placeholder = "/data";
    rootFolderRow.appendChild(rootFolderSpan);
    rootFolderRow.appendChild(rootFolderManual);
    whisparrC.card.appendChild(rootFolderRow);

    const qualityRow = document.createElement("label");
    qualityRow.className = "SettingsField";
    const qualitySpan = document.createElement("span");
    qualitySpan.textContent = "Quality profile";
    const qualityManual = document.createElement("input");
    qualityManual.type = "number";
    qualityManual.value = cfg.whisparrQualityProfileId != null ? String(cfg.whisparrQualityProfileId) : "";
    qualityManual.placeholder = "1";
    qualityRow.appendChild(qualitySpan);
    qualityRow.appendChild(qualityManual);
    whisparrC.card.appendChild(qualityRow);

    const loadOptionsBtn = document.createElement("button");
    loadOptionsBtn.className = "bg-transparent text-text hover:bg-white/10 rounded px-2 py-1 text-xs self-start";
    loadOptionsBtn.textContent = "Load from Whisparr…";
    loadOptionsBtn.addEventListener("click", async () => {
      try {
        const options = await api.whisparrOptions();
        rootFolderRow.replaceChild(rootFolderSelect, rootFolderManual);
        rootFolderSelect.innerHTML = "";
        for (const rf of options.rootFolders) {
          const opt = document.createElement("option");
          opt.value = rf.path;
          opt.textContent = rf.path;
          if (rf.path === cfg.whisparrRootFolderPath) opt.selected = true;
          rootFolderSelect.appendChild(opt);
        }
        const qualitySelect = document.createElement("select");
        for (const qp of options.qualityProfiles) {
          const opt = document.createElement("option");
          opt.value = String(qp.id);
          opt.textContent = qp.name;
          if (qp.id === cfg.whisparrQualityProfileId) opt.selected = true;
          qualitySelect.appendChild(opt);
        }
        qualityRow.replaceChild(qualitySelect, qualityManual);
      } catch (err) {
        alert(`Couldn't load Whisparr options: ${(err as Error).message}. Save the base URL/API key first.`);
      }
    });
    whisparrC.card.appendChild(loadOptionsBtn);

    const whisparrF = footer();
    if (!settings.whisparrConfigured) whisparrF.note.textContent = "not configured";
    else if (!settings.whisparrFullyConfigured) whisparrF.note.textContent = "missing root folder / quality profile";
    whisparrF.save.addEventListener("click", async () => {
      const rootFolderPath = (rootFolderRow.querySelector("select, input") as HTMLSelectElement | HTMLInputElement).value;
      const qualityProfileId = (qualityRow.querySelector("select, input") as HTMLSelectElement | HTMLInputElement).value;
      await api.updateConfig({
        whisparrBaseUrl: whisparrUrl.input.value,
        whisparrApiKey: whisparrKey.input.value,
        whisparrRootFolderPath: rootFolderPath,
        whisparrQualityProfileId: qualityProfileId ? Number(qualityProfileId) : null,
      });
      whisparrKey.input.value = "";
      await retest();
    });
    whisparrC.card.appendChild(whisparrF.row);
    grid.appendChild(whisparrC.card);

    // --- Cloudflare Access ---
    const cfC = card("Cloudflare Access");
    cfC.dot.remove(); // no independent connection test — shared by Stash/Whisparr's own status
    const cfId = fieldRow("Client ID", { value: cfg.cfAccessClientId });
    const cfSecret = fieldRow("Client Secret", { type: "password", placeholder: cfg.cfAccessClientSecretSet ? "(unchanged)" : "not set" });
    cfC.card.appendChild(cfId.row);
    cfC.card.appendChild(cfSecret.row);
    const cfF = footer();
    cfF.note.textContent = "optional — only needed if Stash/Whisparr sit behind Access";
    cfF.save.addEventListener("click", async () => {
      await api.updateConfig({ cfAccessClientId: cfId.input.value, cfAccessClientSecret: cfSecret.input.value });
      cfSecret.input.value = "";
      await retest();
    });
    cfC.card.appendChild(cfF.row);
    grid.appendChild(cfC.card);

    async function retest() {
      const [s, t] = await Promise.all([api.settings(), api.testSettings()]);
      setStatusDot(stashdbC.dot, t.stashdb);
      setStatusDot(stashC.dot, t.localStash);
      setStatusDot(whisparrC.dot, t.whisparr);
      stashF.note.textContent = "";
      stashF.note.textContent = s.localStashConfigured ? "" : "not configured";
      whisparrF.note.textContent = !s.whisparrConfigured ? "not configured" : !s.whisparrFullyConfigured ? "missing root folder / quality profile" : "";
    }

    // --- Global exclude tags ---
    const excludeC = card("Global Exclude Tags", true);
    excludeC.dot.remove();
    const excludeNote = document.createElement("p");
    excludeNote.className = "text-xs text-muted m-0";
    excludeNote.textContent = "Applied everywhere scenes are fetched — Filters, Watched, and Favorites — instead of adding the same exclude to every filter.";
    excludeC.card.appendChild(excludeNote);

    const excludeChips = document.createElement("div");
    excludeChips.className = "flex gap-2 items-center mb-6 flex-wrap";
    excludeC.card.appendChild(excludeChips);

    const excludeSearch = document.createElement("input");
    excludeSearch.placeholder = "search tag to exclude...";
    const excludeResults = document.createElement("div");
    excludeResults.className = "relative";

    async function renderExcludeChips() {
      const tags = await api.listGlobalExcludeTags();
      excludeChips.innerHTML = "";
      for (const t of tags) {
        const chip = document.createElement("span");
        chip.className = "bg-secondary rounded-full px-3 py-1 flex items-center gap-1.5";
        chip.textContent = t.name;
        const remove = document.createElement("button");
        remove.className = "bg-transparent border-0 text-muted p-0 hover:text-text";
        remove.setAttribute("aria-label", "Remove excluded tag");
        remove.appendChild(iconClose());
        remove.addEventListener("click", async () => {
          await api.removeGlobalExcludeTag(t.id);
          await renderExcludeChips();
        });
        chip.appendChild(remove);
        excludeChips.appendChild(chip);
      }
      const searchWrap = document.createElement("div");
      searchWrap.appendChild(excludeSearch);
      searchWrap.appendChild(excludeResults);
      excludeChips.appendChild(searchWrap);
    }

    let excludeDebounce: ReturnType<typeof setTimeout>;
    excludeSearch.addEventListener("input", () => {
      clearTimeout(excludeDebounce);
      const term = excludeSearch.value.trim();
      if (!term) {
        excludeResults.innerHTML = "";
        return;
      }
      excludeDebounce = setTimeout(async () => {
        const matches = await api.searchTags(term);
        excludeResults.innerHTML = "";
        const list = document.createElement("div");
        list.className = "TagPicker-dropdown min-w-[200px]";
        for (const m of matches) {
          const item = document.createElement("div");
          item.textContent = m.name;
          item.className = "TagPicker-dropdown-item";
          item.addEventListener("click", async () => {
            await api.addGlobalExcludeTag(m.id, m.name);
            excludeSearch.value = "";
            excludeResults.innerHTML = "";
            await renderExcludeChips();
          });
          list.appendChild(item);
        }
        excludeResults.appendChild(list);
      }, 250);
    });

    await renderExcludeChips();
    grid.appendChild(excludeC.card);

    const secretsNote = document.createElement("p");
    secretsNote.className = "text-xs text-muted mt-4";
    secretsNote.textContent = "Secrets are encrypted at rest and never sent back to the browser. Leave a key field blank to keep its current value.";
    container.appendChild(secretsNote);
  }

  render();
  return container;
}
