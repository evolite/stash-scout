import { api } from "../api.js";

function statusRow(label: string, ok: boolean, extra?: string): HTMLElement {
  const row = document.createElement("div");
  row.className = "SettingsRow";
  const left = document.createElement("span");
  left.textContent = label + (extra ? ` (${extra})` : "");
  const dot = document.createElement("span");
  dot.className = "status-dot " + (ok ? "ok" : "bad");
  row.appendChild(left);
  row.appendChild(dot);
  return row;
}

function field(label: string, opts: { type?: string; value?: string; placeholder?: string } = {}): { wrap: HTMLElement; input: HTMLInputElement } {
  const wrap = document.createElement("label");
  wrap.textContent = label;
  wrap.style.cssText = "display:flex;flex-direction:column;gap:0.25rem;font-size:0.85rem;color:var(--muted)";
  const input = document.createElement("input");
  input.type = opts.type ?? "text";
  input.value = opts.value ?? "";
  if (opts.placeholder) input.placeholder = opts.placeholder;
  wrap.appendChild(input);
  return { wrap, input };
}

function section(title: string): HTMLElement {
  const wrap = document.createElement("div");
  wrap.className = "SettingsSection";
  const h = document.createElement("h4");
  h.textContent = title;
  wrap.appendChild(h);
  return wrap;
}

export function renderSettingsView(): HTMLElement {
  const container = document.createElement("div");
  container.innerHTML = "<p>Loading…</p>";

  async function render() {
    const cfg = await api.getConfig();
    container.innerHTML = "";

    // --- Connection status ---
    const statusHeading = document.createElement("h3");
    statusHeading.textContent = "Connections";
    container.appendChild(statusHeading);
    const statusGrid = document.createElement("div");
    statusGrid.className = "SettingsGrid";
    statusGrid.innerHTML = "<p>Checking…</p>";
    container.appendChild(statusGrid);
    const testBtn = document.createElement("button");
    testBtn.className = "btn";
    testBtn.textContent = "Test connections";
    testBtn.addEventListener("click", loadStatus);
    container.appendChild(testBtn);

    async function loadStatus() {
      statusGrid.innerHTML = "<p>Checking…</p>";
      const [settings, test] = await Promise.all([api.settings(), api.testSettings()]);
      statusGrid.innerHTML = "";
      statusGrid.appendChild(statusRow("StashDB", test.stashdb, settings.stashdbConfigured ? undefined : "not configured"));
      statusGrid.appendChild(statusRow("Local Stash", test.localStash, settings.localStashConfigured ? undefined : "not configured"));
      statusGrid.appendChild(
        statusRow(
          "Whisparr",
          test.whisparr,
          !settings.whisparrConfigured ? "not configured" : !settings.whisparrFullyConfigured ? "missing root folder / quality profile" : undefined,
        ),
      );
    }
    loadStatus();

    const note = document.createElement("p");
    note.style.cssText = "color:var(--muted);font-size:0.85rem;margin:1rem 0";
    note.textContent = "Secrets are encrypted at rest and never sent back to the browser. Leave a key field blank to keep its current value.";
    container.appendChild(note);

    // --- StashDB ---
    const stashdbSection = section("StashDB");
    const stashdbUrl = field("GraphQL URL", { value: cfg.stashdbUrl });
    const stashdbKey = field("API Key", { type: "password", placeholder: cfg.stashdbApiKeySet ? "(unchanged)" : "not set" });
    stashdbSection.appendChild(stashdbUrl.wrap);
    stashdbSection.appendChild(stashdbKey.wrap);
    const stashdbSave = document.createElement("button");
    stashdbSave.className = "btn";
    stashdbSave.textContent = "Save";
    stashdbSave.addEventListener("click", async () => {
      await api.updateConfig({ stashdbUrl: stashdbUrl.input.value, stashdbApiKey: stashdbKey.input.value });
      stashdbKey.input.value = "";
      await loadStatus();
    });
    stashdbSection.appendChild(stashdbSave);
    container.appendChild(stashdbSection);

    // --- Local Stash ---
    const stashSection = section("Local Stash");
    const stashGqlUrl = field("GraphQL URL", { value: cfg.localStashUrl, placeholder: "http://localhost:9999/graphql" });
    const stashRootUrl = field("Root URL", { value: cfg.localStashRootUrl, placeholder: "http://localhost:9999" });
    const stashKey = field("API Key", { type: "password", placeholder: cfg.localStashApiKeySet ? "(unchanged)" : "not set" });
    stashSection.appendChild(stashGqlUrl.wrap);
    stashSection.appendChild(stashRootUrl.wrap);
    stashSection.appendChild(stashKey.wrap);
    const stashSave = document.createElement("button");
    stashSave.className = "btn";
    stashSave.textContent = "Save";
    stashSave.addEventListener("click", async () => {
      await api.updateConfig({
        localStashUrl: stashGqlUrl.input.value,
        localStashRootUrl: stashRootUrl.input.value,
        localStashApiKey: stashKey.input.value,
      });
      stashKey.input.value = "";
      await loadStatus();
    });
    stashSection.appendChild(stashSave);
    container.appendChild(stashSection);

    // --- Whisparr ---
    const whisparrSection = section("Whisparr");
    const whisparrUrl = field("Base URL", { value: cfg.whisparrBaseUrl, placeholder: "http://localhost:6969" });
    const whisparrKey = field("API Key", { type: "password", placeholder: cfg.whisparrApiKeySet ? "(unchanged)" : "not set" });
    whisparrSection.appendChild(whisparrUrl.wrap);
    whisparrSection.appendChild(whisparrKey.wrap);

    const rootFolderLabel = document.createElement("label");
    rootFolderLabel.textContent = "Root folder path";
    rootFolderLabel.style.cssText = "display:flex;flex-direction:column;gap:0.25rem;font-size:0.85rem;color:var(--muted)";
    const rootFolderSelect = document.createElement("select");
    const rootFolderManual = document.createElement("input");
    rootFolderManual.value = cfg.whisparrRootFolderPath;
    rootFolderManual.placeholder = "/data";
    rootFolderLabel.appendChild(rootFolderManual);
    whisparrSection.appendChild(rootFolderLabel);

    const qualityLabel = document.createElement("label");
    qualityLabel.textContent = "Quality profile";
    qualityLabel.style.cssText = "display:flex;flex-direction:column;gap:0.25rem;font-size:0.85rem;color:var(--muted)";
    const qualityManual = document.createElement("input");
    qualityManual.type = "number";
    qualityManual.value = cfg.whisparrQualityProfileId != null ? String(cfg.whisparrQualityProfileId) : "";
    qualityManual.placeholder = "1";
    qualityLabel.appendChild(qualityManual);
    whisparrSection.appendChild(qualityLabel);

    const loadOptionsBtn = document.createElement("button");
    loadOptionsBtn.className = "btn minimal";
    loadOptionsBtn.textContent = "Load root folders / quality profiles from Whisparr";
    loadOptionsBtn.addEventListener("click", async () => {
      try {
        const options = await api.whisparrOptions();
        rootFolderLabel.replaceChild(rootFolderSelect, rootFolderManual);
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
        qualityLabel.replaceChild(qualitySelect, qualityManual);
      } catch (err) {
        alert(`Couldn't load Whisparr options: ${(err as Error).message}. Save the base URL/API key first.`);
      }
    });
    whisparrSection.appendChild(loadOptionsBtn);

    const whisparrSave = document.createElement("button");
    whisparrSave.className = "btn";
    whisparrSave.textContent = "Save";
    whisparrSave.addEventListener("click", async () => {
      const rootFolderPath = (rootFolderLabel.querySelector("select, input") as HTMLSelectElement | HTMLInputElement).value;
      const qualityProfileId = (qualityLabel.querySelector("select, input") as HTMLSelectElement | HTMLInputElement).value;
      await api.updateConfig({
        whisparrBaseUrl: whisparrUrl.input.value,
        whisparrApiKey: whisparrKey.input.value,
        whisparrRootFolderPath: rootFolderPath,
        whisparrQualityProfileId: qualityProfileId ? Number(qualityProfileId) : null,
      });
      whisparrKey.input.value = "";
      await loadStatus();
    });
    whisparrSection.appendChild(whisparrSave);
    container.appendChild(whisparrSection);

    // --- Cloudflare Access ---
    const cfSection = section("Cloudflare Access (optional)");
    const cfId = field("Client ID", { value: cfg.cfAccessClientId });
    const cfSecret = field("Client Secret", { type: "password", placeholder: cfg.cfAccessClientSecretSet ? "(unchanged)" : "not set" });
    cfSection.appendChild(cfId.wrap);
    cfSection.appendChild(cfSecret.wrap);
    const cfSave = document.createElement("button");
    cfSave.className = "btn";
    cfSave.textContent = "Save";
    cfSave.addEventListener("click", async () => {
      await api.updateConfig({ cfAccessClientId: cfId.input.value, cfAccessClientSecret: cfSecret.input.value });
      cfSecret.input.value = "";
      await loadStatus();
    });
    cfSection.appendChild(cfSave);
    container.appendChild(cfSection);

    // --- Global exclude tags ---
    const excludeSection = section("Global Exclude Tags");
    const excludeNote = document.createElement("p");
    excludeNote.style.cssText = "color:var(--muted);font-size:0.8rem;margin:0";
    excludeNote.textContent = "Applied everywhere scenes are fetched — Browse, Watched, and Favorites — so you don't have to add the same exclude to every filter.";
    excludeSection.appendChild(excludeNote);

    const excludeChips = document.createElement("div");
    excludeChips.className = "WatchedTagsManage";
    excludeSection.appendChild(excludeChips);

    const excludeSearch = document.createElement("input");
    excludeSearch.placeholder = "search tag to exclude...";
    const excludeResults = document.createElement("div");
    excludeResults.style.position = "relative";

    async function renderExcludeChips() {
      const tags = await api.listGlobalExcludeTags();
      excludeChips.innerHTML = "";
      for (const t of tags) {
        const chip = document.createElement("span");
        chip.className = "Chip";
        chip.textContent = t.name;
        const remove = document.createElement("button");
        remove.textContent = "×";
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
        list.style.cssText =
          "position:absolute;background:var(--secondary);border-radius:3px;z-index:10;max-height:200px;overflow:auto;min-width:200px";
        for (const m of matches) {
          const item = document.createElement("div");
          item.textContent = m.name;
          item.style.cssText = "padding:0.35rem 0.5rem;cursor:pointer";
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
    container.appendChild(excludeSection);
  }

  render();
  return container;
}
