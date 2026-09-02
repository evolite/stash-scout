// Shown once, on first run (nothing configured yet, and not previously
// dismissed — see main.ts). Appended to <body>, not the app's #root, so it
// survives root's full-teardown re-renders (main.ts's render() does
// root.innerHTML = "" on every tab switch/toggle).
export function renderOnboardingModal(onDismiss: () => void): HTMLElement {
  const overlay = document.createElement("div");
  overlay.className = "fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6";

  const card = document.createElement("div");
  card.className = "bg-surface border border-line rounded-lg p-6 max-w-md flex flex-col gap-3";
  overlay.appendChild(card);

  const title = document.createElement("h2");
  title.className = "text-base font-semibold";
  title.textContent = "Welcome to Stash Scout";
  card.appendChild(title);

  const intro = document.createElement("p");
  intro.className = "text-sm text-muted";
  intro.textContent = "A quick rundown before you get started:";
  card.appendChild(intro);

  const list = document.createElement("ul");
  list.className = "text-sm text-muted list-disc pl-5 flex flex-col gap-1.5";
  for (const item of [
    "Add your StashDB API key here in Settings first — nothing else works without it.",
    "Local Stash and Whisparr are optional: connect them to see what you already own and add what you don't, right from a scene card.",
    "Save a search as a filter and mark it “watched” to feed it into the Feed tab's New Releases.",
    "Global Exclude Tags (in Settings) hides a tag everywhere at once, instead of adding it to every filter.",
  ]) {
    const li = document.createElement("li");
    li.textContent = item;
    list.appendChild(li);
  }
  card.appendChild(list);

  const dismiss = document.createElement("button");
  dismiss.type = "button";
  dismiss.className = "self-end bg-accent text-white rounded px-4 py-2 text-sm font-medium hover:brightness-110";
  dismiss.textContent = "Got it";
  dismiss.addEventListener("click", () => {
    overlay.remove();
    onDismiss();
  });
  card.appendChild(dismiss);

  return overlay;
}
