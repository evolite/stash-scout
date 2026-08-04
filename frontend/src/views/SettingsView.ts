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

export function renderSettingsView(): HTMLElement {
  const container = document.createElement("div");
  const heading = document.createElement("h3");
  heading.textContent = "Connections";
  container.appendChild(heading);

  const grid = document.createElement("div");
  grid.className = "SettingsGrid";
  grid.innerHTML = "<p>Checking…</p>";
  container.appendChild(grid);

  const note = document.createElement("p");
  note.style.color = "var(--muted)";
  note.style.fontSize = "0.85rem";
  note.textContent =
    "Connections are configured via the server's .env file (STASHDB_API_KEY, LOCAL_STASH_URL/API_KEY, WHISPARR_BASE_URL/API_KEY) — never exposed to the browser.";
  container.appendChild(note);

  const testBtn = document.createElement("button");
  testBtn.className = "btn";
  testBtn.textContent = "Test connections";
  testBtn.addEventListener("click", load);
  container.appendChild(testBtn);

  async function load() {
    grid.innerHTML = "<p>Checking…</p>";
    const [settings, test] = await Promise.all([api.settings(), api.testSettings()]);
    grid.innerHTML = "";
    grid.appendChild(statusRow("StashDB", test.stashdb));
    grid.appendChild(
      statusRow("Local Stash", test.localStash, settings.localStashConfigured ? undefined : "not configured"),
    );
    grid.appendChild(
      statusRow(
        "Whisparr",
        test.whisparr,
        !settings.whisparrConfigured
          ? "not configured"
          : !settings.whisparrFullyConfigured
            ? "missing root folder / quality profile"
            : undefined,
      ),
    );
  }

  load();
  return container;
}
