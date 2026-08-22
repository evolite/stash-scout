import { api } from "../api.js";
import { GENDERS, getShownGenders, setGenderShown } from "../genderPrefs.js";

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
  container.className = "max-w-2xl";
  const loading = document.createElement("p");
  loading.className = "text-muted text-sm";
  loading.textContent = "Loading…";
  container.appendChild(loading);

  async function render() {
    const [cfg, settings, test] = await Promise.all([api.getConfig(), api.settings(), api.testSettings()]);
    container.innerHTML = "";

    const panel = document.createElement("div");
    panel.className = "bg-surface border border-line rounded-lg divide-y divide-line";
    container.appendChild(panel);

    let dirty = false;
    function markDirty() {
      if (dirty) return;
      dirty = true;
      saveBtn.disabled = false;
      bottomNote.textContent = "Unsaved changes";
    }

    // --- StashDB ---
    const stashdbS = section("StashDB", "Metadata for scenes, performers, and studios.");
    setStatusPill(stashdbS.pill, test.stashdb);
    const stashdbUrl = fieldRow("URL", { value: cfg.stashdbUrl });
    const stashdbKey = fieldRow("API Key", { type: "password", placeholder: cfg.stashdbApiKeySet ? "(unchanged)" : "not set" });
    stashdbS.body.appendChild(stashdbUrl.row);
    stashdbS.body.appendChild(stashdbKey.row);
    panel.appendChild(stashdbS.section);

    // --- Local Stash ---
    const stashS = section("Local Stash", "Checks what's already in your library.");
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
    const whisparrS = section("Whisparr", "Downloads monitored scenes automatically.");
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
    const cfS = section("Cloudflare Access", "Only needed if Stash or Whisparr sit behind Access.");
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
    gendersPanel.className = "bg-surface border border-line rounded-lg p-5 flex flex-col gap-3 mt-4";
    const gendersTitle = document.createElement("h3");
    gendersTitle.className = "m-0 text-sm font-semibold";
    gendersTitle.textContent = "Performers shown on scene cards";
    const gendersSub = document.createElement("p");
    gendersSub.className = "m-0 text-xs text-muted";
    gendersSub.textContent = "A performer with no gender recorded on StashDB always shows, regardless of these.";
    gendersPanel.appendChild(gendersTitle);
    gendersPanel.appendChild(gendersSub);
    const gendersGrid = document.createElement("div");
    gendersGrid.className = "grid grid-cols-2 gap-2";
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
    container.appendChild(gendersPanel);

    // --- Save bar ---
    const saveBar = document.createElement("div");
    saveBar.className = "flex items-center justify-between gap-2 mt-4";
    const bottomNote = document.createElement("span");
    bottomNote.className = "text-xs text-muted";
    const saveBtn = document.createElement("button");
    saveBtn.className = "bg-accent text-white rounded px-4 py-2 text-sm font-medium hover:brightness-110 shrink-0 transition disabled:opacity-40 disabled:cursor-default disabled:hover:brightness-100";
    saveBtn.textContent = "Save changes";
    saveBtn.disabled = true;
    saveBar.appendChild(bottomNote);
    saveBar.appendChild(saveBtn);
    container.appendChild(saveBar);

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
