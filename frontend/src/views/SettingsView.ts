import { api } from "../api.js";
import {
  GENDERS,
  getShownGenders,
  setGenderShown,
  getHideGayScenes,
  setHideGayScenes,
  getHideLesbianScenes,
  setHideLesbianScenes,
  getHideStraightScenes,
  setHideStraightScenes,
} from "../genderPrefs.js";
import { renderExcludeTagsPanel } from "../components/ExcludeTagsPanel.js";

function statusPill(ok: boolean | null): HTMLElement {
  const pill = document.createElement("span");
  pill.className = "flex items-center gap-1.5 text-xs font-medium shrink-0";
  const dot = document.createElement("span");
  const label = document.createElement("span");
  pill.appendChild(dot);
  pill.appendChild(label);
  setStatusPill(pill, ok);
  return pill;
}

function statusKind(ok: boolean | null): "unknown" | "connected" | "offline" {
  if (ok === null) return "unknown";
  return ok ? "connected" : "offline";
}

function setStatusPill(pill: HTMLElement, ok: boolean | null): void {
  const dot = pill.children[0] as HTMLElement;
  const label = pill.children[1] as HTMLElement;
  const kind = statusKind(ok);
  const dotColor = { unknown: "bg-text-faint", connected: "bg-success", offline: "bg-danger" }[kind];
  const textColor = { unknown: "text-text-faint", connected: "text-success", offline: "text-danger" }[kind];
  const text = { unknown: "Unknown", connected: "Connected", offline: "Offline" }[kind];
  dot.className = `inline-block w-[7px] h-[7px] rounded-full shrink-0 ${dotColor}`;
  label.className = textColor;
  label.textContent = text;
}

const SECRET_HINT = "Encrypted at rest and never sent back to the browser. Leave blank to keep the current value.";

function fieldRow(label: string, opts: { type?: string; value?: string; placeholder?: string } = {}): { row: HTMLElement; input: HTMLInputElement } {
  const row = document.createElement("label");
  row.className = "SettingsField";
  const span = document.createElement("span");
  span.textContent = label;
  const input = document.createElement("input");
  input.type = opts.type ?? "text";
  input.value = opts.value ?? "";
  if (opts.placeholder) input.placeholder = opts.placeholder;
  if (opts.type === "password") input.title = SECRET_HINT;
  row.appendChild(span);
  row.appendChild(input);
  return { row, input };
}

function section(title: string, subtitle: string): { section: HTMLElement; body: HTMLElement; pill: HTMLElement; note: HTMLElement } {
  const el = document.createElement("section");
  el.className = "p-5 flex flex-col gap-3";
  const header = document.createElement("div");
  header.className = "flex items-start justify-between gap-3";
  const titleBlock = document.createElement("div");
  const h = document.createElement("h3");
  h.className = "m-0 text-sm font-semibold";
  h.textContent = title;
  const sub = document.createElement("p");
  sub.className = "m-0 mt-0.5 text-xs text-muted";
  sub.textContent = subtitle;
  titleBlock.appendChild(h);
  titleBlock.appendChild(sub);
  const statusBlock = document.createElement("div");
  statusBlock.className = "flex flex-col items-end gap-1";
  const pill = statusPill(null);
  const note = document.createElement("span");
  note.className = "text-xs text-amber";
  statusBlock.appendChild(pill);
  statusBlock.appendChild(note);
  header.appendChild(titleBlock);
  header.appendChild(statusBlock);
  const body = document.createElement("div");
  body.className = "flex flex-col gap-2";
  el.appendChild(header);
  el.appendChild(body);
  return { section: el, body, pill, note };
}

export function renderSettingsView(): HTMLElement {
  const container = document.createElement("div");
  container.className = "grid grid-cols-[minmax(360px,480px)_1fr] gap-4 items-start";
  const loading = document.createElement("p");
  loading.className = "text-muted text-sm";
  loading.textContent = "Loading…";
  container.appendChild(loading);

  async function render() {
    const [cfg, settings, test] = await Promise.all([api.getConfig(), api.settings(), api.testSettings()]);
    container.innerHTML = "";

    const leftCol = document.createElement("div");
    leftCol.className = "flex flex-col gap-4";
    const rightCol = document.createElement("div");
    rightCol.className = "flex flex-col gap-4";
    container.append(leftCol, rightCol);

    const panel = document.createElement("div");
    panel.className = "bg-surface border border-line rounded-lg divide-y divide-line";
    leftCol.appendChild(panel);

    let dirty = false;
    function markDirty() {
      if (dirty) return;
      dirty = true;
      saveBtn.disabled = false;
      bottomNote.textContent = "Unsaved changes";
    }

    // --- StashDB ---
    const stashdbS = section("StashDB", "Scene & performer metadata.");
    setStatusPill(stashdbS.pill, test.stashdb);
    const stashdbUrl = fieldRow("URL", { value: cfg.stashdbUrl });
    const stashdbKey = fieldRow("API Key", { type: "password", placeholder: cfg.stashdbApiKeySet ? "(unchanged)" : "not set" });
    stashdbS.body.appendChild(stashdbUrl.row);
    stashdbS.body.appendChild(stashdbKey.row);
    panel.appendChild(stashdbS.section);

    // --- Local Stash ---
    const stashS = section("Local Stash", "Checks your library.");
    setStatusPill(stashS.pill, test.localStash);
    if (!settings.localStashConfigured) stashS.note.textContent = "not configured";
    const stashGqlUrl = fieldRow("GraphQL URL", { value: cfg.localStashUrl, placeholder: "http://localhost:9999/graphql" });
    stashGqlUrl.input.title = "Used to connect and query your library — can be a remote/tunneled address.";
    const stashRootUrl = fieldRow("Playback URL", { value: cfg.localStashRootUrl, placeholder: "http://localhost:9999" });
    stashRootUrl.input.title = "Used to open scenes in your browser. Can differ from the GraphQL URL — e.g. localhost:9999 for playback even if you connect through a remote host.";
    const stashKey = fieldRow("API Key", { type: "password", placeholder: cfg.localStashApiKeySet ? "(unchanged)" : "not set" });
    stashS.body.appendChild(stashGqlUrl.row);
    stashS.body.appendChild(stashRootUrl.row);
    stashS.body.appendChild(stashKey.row);
    panel.appendChild(stashS.section);

    // --- Whisparr ---
    const whisparrS = section("Whisparr", "Auto-downloads monitored scenes.");
    setStatusPill(whisparrS.pill, test.whisparr);
    if (!settings.whisparrConfigured) whisparrS.note.textContent = "not configured";
    else if (!settings.whisparrFullyConfigured) whisparrS.note.textContent = "missing root folder / quality profile";
    const whisparrUrl = fieldRow("Base URL", { value: cfg.whisparrBaseUrl, placeholder: "http://localhost:6969" });
    const whisparrKey = fieldRow("API Key", { type: "password", placeholder: cfg.whisparrApiKeySet ? "(unchanged)" : "not set" });
    whisparrS.body.appendChild(whisparrUrl.row);
    whisparrS.body.appendChild(whisparrKey.row);

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
    whisparrS.body.appendChild(rootFolderRow);

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
    whisparrS.body.appendChild(qualityRow);

    const loadOptionsBtn = document.createElement("button");
    loadOptionsBtn.type = "button";
    loadOptionsBtn.className = "bg-black/20 text-text hover:bg-white/10 rounded px-2.5 py-1.5 text-xs self-start transition";
    loadOptionsBtn.textContent = "Load from Whisparr…";
    loadOptionsBtn.addEventListener("click", async () => {
      try {
        const options = await api.whisparrOptions();
        rootFolderManual.replaceWith(rootFolderSelect);
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
        qualityManual.replaceWith(qualitySelect);
        rootFolderSelect.addEventListener("change", markDirty);
        qualitySelect.addEventListener("change", markDirty);
        markDirty();
      } catch (err) {
        alert(`Couldn't load Whisparr options: ${(err as Error).message}. Save the base URL/API key first.`);
      }
    });
    whisparrS.body.appendChild(loadOptionsBtn);
    panel.appendChild(whisparrS.section);

    // --- Cloudflare Access ---
    const cfS = section("Cloudflare Access", "Only if Stash/Whisparr sit behind it.");
    cfS.pill.remove(); // no independent connection test — shared by Stash/Whisparr's own status
    const cfId = fieldRow("Client ID", { value: cfg.cfAccessClientId });
    const cfSecret = fieldRow("Client Secret", { type: "password", placeholder: cfg.cfAccessClientSecretSet ? "(unchanged)" : "not set" });
    cfS.body.appendChild(cfId.row);
    cfS.body.appendChild(cfSecret.row);
    panel.appendChild(cfS.section);

    panel.querySelectorAll("input, select").forEach((input) => {
      input.addEventListener("input", markDirty);
      input.addEventListener("change", markDirty);
    });

    // --- Performer genders shown on scene cards ---
    // A browsing preference, not a server-synced connection setting — applies
    // instantly (localStorage, see genderPrefs.ts), so it's kept outside
    // `panel`/the dirty-tracking Save flow above on purpose.
    const gendersPanel = document.createElement("div");
    gendersPanel.className = "bg-surface border border-line rounded-lg p-5 flex flex-col gap-3";
    const gendersTitle = document.createElement("h3");
    gendersTitle.className = "m-0 text-sm font-semibold";
    gendersTitle.textContent = "Genders shown on cards";
    gendersTitle.title = "A performer with no gender recorded always shows, regardless of these.";
    gendersPanel.appendChild(gendersTitle);
    const gendersGrid = document.createElement("div");
    gendersGrid.className = "grid grid-cols-3 gap-2";
    const shown = getShownGenders();
    for (const g of GENDERS) {
      const row = document.createElement("label");
      row.className = "flex items-center gap-2 text-sm";
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = shown.has(g.id);
      checkbox.addEventListener("change", () => setGenderShown(g.id, checkbox.checked));
      const text = document.createElement("span");
      text.textContent = g.label;
      row.appendChild(checkbox);
      row.appendChild(text);
      gendersGrid.appendChild(row);
    }
    gendersPanel.appendChild(gendersGrid);
    rightCol.appendChild(gendersPanel);

    // --- Hide scenes by cast ---
    // Whole-scene filter, same localStorage pattern as the panel above.
    const sceneFilterPanel = document.createElement("div");
    sceneFilterPanel.className = "bg-surface border border-line rounded-lg p-5 flex flex-col gap-3";
    const sfTitle = document.createElement("h3");
    sfTitle.className = "m-0 text-sm font-semibold";
    sfTitle.textContent = "Hide scenes";
    sceneFilterPanel.appendChild(sfTitle);
    const sfRow = document.createElement("div");
    sfRow.className = "flex flex-wrap gap-4";
    for (const [label, get, set] of [
      ["Gay", getHideGayScenes, setHideGayScenes],
      ["Lesbian", getHideLesbianScenes, setHideLesbianScenes],
      ["Straight", getHideStraightScenes, setHideStraightScenes],
    ] as const) {
      const row = document.createElement("label");
      row.className = "flex items-center gap-2 text-sm";
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = get();
      checkbox.addEventListener("change", () => set(checkbox.checked));
      const text = document.createElement("span");
      text.textContent = label;
      row.appendChild(checkbox);
      row.appendChild(text);
      sfRow.appendChild(row);
    }
    sceneFilterPanel.appendChild(sfRow);
    rightCol.appendChild(sceneFilterPanel);

    // --- Global exclude tags ---
    // Server-synced but self-persisting (each add/remove hits the API on its
    // own), so like the genders panel it sits outside the dirty-tracked Save
    // flow above.
    const excludePanel = document.createElement("div");
    excludePanel.className = "bg-surface border border-line rounded-lg p-5 flex flex-col gap-3";
    const excludeTitle = document.createElement("h3");
    excludeTitle.className = "m-0 text-sm font-semibold";
    excludeTitle.textContent = "Global exclude tags";
    excludeTitle.title = "Hidden everywhere scenes are fetched — Scenes and the Feed — instead of adding the same exclude to every saved filter.";
    excludePanel.append(excludeTitle);
    rightCol.appendChild(excludePanel);
    renderExcludeTagsPanel().then((p) => excludePanel.appendChild(p));

    // --- Save bar ---
    const saveBar = document.createElement("div");
    saveBar.className = "flex items-center justify-between gap-2";
    const bottomNote = document.createElement("span");
    bottomNote.className = "text-xs text-muted";
    const saveBtn = document.createElement("button");
    saveBtn.className = "bg-accent text-white rounded px-4 py-2 text-sm font-medium hover:brightness-110 shrink-0 transition disabled:opacity-40 disabled:cursor-default disabled:hover:brightness-100";
    saveBtn.textContent = "Save changes";
    saveBtn.disabled = true;
    saveBar.appendChild(bottomNote);
    saveBar.appendChild(saveBtn);
    leftCol.appendChild(saveBar);

    saveBtn.addEventListener("click", async () => {
      saveBtn.disabled = true;
      saveBtn.textContent = "Saving…";
      const rootFolderPath = (rootFolderRow.querySelector("select, input") as HTMLSelectElement | HTMLInputElement).value;
      const qualityProfileId = (qualityRow.querySelector("select, input") as HTMLSelectElement | HTMLInputElement).value;
      await api.updateConfig({
        stashdbUrl: stashdbUrl.input.value,
        stashdbApiKey: stashdbKey.input.value,
        localStashUrl: stashGqlUrl.input.value,
        localStashRootUrl: stashRootUrl.input.value,
        localStashApiKey: stashKey.input.value,
        whisparrBaseUrl: whisparrUrl.input.value,
        whisparrApiKey: whisparrKey.input.value,
        whisparrRootFolderPath: rootFolderPath,
        whisparrQualityProfileId: qualityProfileId ? Number(qualityProfileId) : null,
        cfAccessClientId: cfId.input.value,
        cfAccessClientSecret: cfSecret.input.value,
      });
      stashdbKey.input.value = "";
      stashKey.input.value = "";
      whisparrKey.input.value = "";
      cfSecret.input.value = "";
      dirty = false;
      saveBtn.textContent = "Save changes";
      bottomNote.textContent = "Saved ✓";

      const [s, t] = await Promise.all([api.settings(), api.testSettings()]);
      setStatusPill(stashdbS.pill, t.stashdb);
      setStatusPill(stashS.pill, t.localStash);
      setStatusPill(whisparrS.pill, t.whisparr);
      stashS.note.textContent = s.localStashConfigured ? "" : "not configured";
      let whisparrNote = "";
      if (!s.whisparrConfigured) whisparrNote = "not configured";
      else if (!s.whisparrFullyConfigured) whisparrNote = "missing root folder / quality profile";
      whisparrS.note.textContent = whisparrNote;
    });
  }

  render();
  return container;
}
