import { api } from "../api.js";

const DISMISSED_KEY = "dismissedUpdate";

// Appended to <body> (like OnboardingModal) so root's full re-renders don't
// remove it. "Later" remembers the version, so it only nags again for a newer one.
export async function maybeShowUpdateModal(): Promise<void> {
  let info;
  try {
    info = await api.version();
  } catch {
    return;
  }
  if (!info.updateAvailable || !info.latest) return;
  try {
    if (localStorage.getItem(DISMISSED_KEY) === info.latest) return;
  } catch {
    /* storage blocked: just show it */
  }
  const latest = info.latest;

  const overlay = document.createElement("div");
  overlay.className = "fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6";
  const card = document.createElement("div");
  card.className = "bg-surface border border-line rounded-lg p-6 max-w-md flex flex-col gap-3";
  overlay.appendChild(card);

  const title = document.createElement("h2");
  title.className = "text-base font-semibold m-0";
  title.textContent = "Update available";
  const body = document.createElement("p");
  body.className = "text-sm text-muted m-0";
  body.textContent = `Stash Scout ${latest} is out — you're running ${info.current}. Pull the new image and restart the container to update.`;
  const notes = document.createElement("a");
  notes.href = info.url;
  notes.target = "_blank";
  notes.rel = "noopener noreferrer";
  notes.className = "text-sm text-link hover:underline";
  notes.textContent = "See what's new on GitHub →";

  const later = document.createElement("button");
  later.type = "button";
  later.className = "self-end bg-accent text-white rounded px-4 py-2 text-sm font-medium hover:brightness-110";
  later.textContent = "Later";
  later.addEventListener("click", () => {
    try {
      localStorage.setItem(DISMISSED_KEY, latest);
    } catch {
      /* ignore */
    }
    overlay.remove();
  });

  card.append(title, body, notes, later);
  document.body.appendChild(overlay);
}
