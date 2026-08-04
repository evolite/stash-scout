import { api, type Scene, type SceneStatus } from "../api.js";

function formatDuration(seconds: number | null): string {
  if (!seconds) return "";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const mm = String(m).padStart(h ? 2 : 1, "0");
  const ss = String(s).padStart(2, "0");
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

// Labels/classes/colors mirror StashSeer's button state machine 1:1
// (stashseer.js ~1275-1571 for labels, ~168-268 for the btn-* color classes)
// so this reads as the same tool: btn-play (green), btn-monitor (gray, both
// "Add Scene" and "Not in Stash" share it), btn-monitored (teal),
// btn-previously-added (amber), btn-loading (blue), btn-settings (gray).
function statusButton(sceneId: string, status: SceneStatus | undefined, onChange: () => void): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.className = "SceneCard-status";

  if (!status) {
    btn.classList.add("btn-loading", "btn-checking");
    btn.textContent = "Checking Stash...";
    btn.disabled = true;
    return btn;
  }

  switch (status.kind) {
    case "not-configured":
      btn.classList.add("btn-settings");
      btn.textContent = "Not Configured";
      btn.disabled = true;
      break;
    case "in-stash":
      btn.classList.add("btn-play");
      btn.textContent = "Play";
      btn.addEventListener("click", () => window.open(status.localUrl, "_blank"));
      break;
    case "not-added":
      btn.classList.add("btn-monitor");
      btn.textContent = status.whisparrConfigured ? "Add Scene" : "Not in Stash";
      btn.disabled = !status.whisparrConfigured;
      if (status.whisparrConfigured) {
        btn.addEventListener("click", async () => {
          btn.disabled = true;
          btn.classList.add("btn-loading");
          btn.textContent = "Adding to Whisparr...";
          await api.addToWhisparr(sceneId);
          onChange();
        });
      }
      break;
    case "previously-added":
      btn.classList.add("btn-monitor", "btn-previously-added");
      btn.textContent = "Previously Added";
      btn.addEventListener("click", async () => {
        btn.disabled = true;
        btn.classList.add("btn-loading");
        btn.textContent = "Enabling monitoring...";
        await api.setMonitored(status.movieId, true);
        onChange();
      });
      break;
    case "monitored":
      btn.classList.add("btn-monitor", "btn-monitored");
      btn.textContent = "Monitored";
      btn.addEventListener("click", async () => {
        btn.disabled = true;
        await api.setMonitored(status.movieId, false);
        onChange();
      });
      break;
    case "downloading": {
      const { size, sizeleft, status: queueStatus } = status.queue;
      let label = "Downloading";
      if (typeof size === "number" && typeof sizeleft === "number" && size > 0 && sizeleft >= 0) {
        label = `${Math.max(0, Math.min(100, Math.round(((size - sizeleft) / size) * 100)))}%`;
      } else if (queueStatus) {
        label = queueStatus;
      }
      btn.classList.add("btn-loading");
      btn.textContent = label;
      btn.disabled = true;
      break;
    }
  }
  return btn;
}

export function renderSceneCard(
  s: Scene,
  status: SceneStatus | undefined,
  onStatusChange: () => void,
  onIgnore?: () => void,
): HTMLElement {
  const card = document.createElement("div");
  card.className = "card";

  const imageWrap = document.createElement("a");
  imageWrap.className = "SceneCard-image";
  imageWrap.href = `https://stashdb.org/scenes/${s.id}`;
  imageWrap.target = "_blank";
  const image = s.images[0];
  if (image) {
    const img = document.createElement("img");
    img.src = image.url;
    img.alt = "";
    imageWrap.appendChild(img);
  }
  card.appendChild(imageWrap);

  const footer = document.createElement("div");
  footer.className = "SceneCard-footer";

  const titleRow = document.createElement("div");
  titleRow.className = "SceneCard-title-row";
  const title = document.createElement("a");
  title.className = "SceneCard-title";
  title.textContent = s.title ?? "(untitled)";
  title.href = `https://stashdb.org/scenes/${s.id}`;
  title.target = "_blank";
  titleRow.appendChild(title);
  const duration = document.createElement("span");
  duration.className = "SceneCard-duration";
  duration.textContent = formatDuration(s.duration);
  titleRow.appendChild(duration);
  footer.appendChild(titleRow);

  const meta = document.createElement("div");
  meta.className = "SceneCard-meta";
  const studio = document.createElement("span");
  studio.className = "SceneCard-studio";
  studio.textContent = s.studio?.name ?? "";
  meta.appendChild(studio);
  const date = document.createElement("strong");
  date.textContent = s.release_date ?? "";
  meta.appendChild(date);
  footer.appendChild(meta);

  if (onIgnore) {
    const actionRow = document.createElement("div");
    actionRow.className = "SceneCard-actions";
    actionRow.appendChild(statusButton(s.id, status, onStatusChange));
    const ignoreBtn = document.createElement("button");
    ignoreBtn.className = "SceneCard-status btn-monitor SceneCard-ignore";
    ignoreBtn.textContent = "Ignore";
    ignoreBtn.title = "Hide this scene from Watched";
    ignoreBtn.addEventListener("click", async () => {
      ignoreBtn.disabled = true;
      await api.ignoreScene(s.id);
      onIgnore();
    });
    actionRow.appendChild(ignoreBtn);
    footer.appendChild(actionRow);
  } else {
    footer.appendChild(statusButton(s.id, status, onStatusChange));
  }

  card.appendChild(footer);
  return card;
}
