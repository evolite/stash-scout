import { api, type VersionInfo } from "../api.js";

function el(tag: string, className: string, text?: string): HTMLElement {
  const e = document.createElement(tag);
  e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}

// Renders the git-cliff CHANGELOG.md format: "## [x.y.z] - date", "### Group",
// "- item". Anything else (title, intro text) is ignored.
export function renderChangelog(markdown: string): HTMLElement {
  const wrap = el("div", "flex flex-col gap-4");
  let list: HTMLElement | null = null;
  for (const line of markdown.split("\n")) {
    const release = /^## \[(.+?)\](?: - (.+))?$/.exec(line);
    if (release) {
      const head = el("div", "flex items-baseline gap-2 pt-1");
      head.append(
        el("h4", "m-0 text-sm font-semibold", release[1] === "Unreleased" ? "Unreleased" : `v${release[1]}`),
        el("span", "text-xs text-text-faint", release[2] ?? ""),
      );
      wrap.appendChild(head);
      list = null;
    } else if (line.startsWith("### ")) {
      wrap.appendChild(el("div", "text-[11px] font-medium uppercase tracking-wider text-text-faint", line.slice(4)));
      list = el("ul", "m-0 pl-5 list-disc text-sm text-muted flex flex-col gap-1");
      wrap.appendChild(list);
    } else if (line.startsWith("- ") && list) {
      list.appendChild(el("li", "", line.slice(2)));
    }
  }
  if (!wrap.children.length) return el("p", "m-0 text-sm text-muted", "No release notes in this build.");
  return wrap;
}

function versionLine(info: VersionInfo): string {
  if (!info.checkEnabled) return "Update check is turned off (DISABLE_UPDATE_CHECK).";
  if (info.updateAvailable) return `Update available: v${info.latest}`;
  if (info.latest) return "You're up to date.";
  return info.error ? "Couldn't reach GitHub to check for updates." : "No release found.";
}

export function renderAboutPanel(): HTMLElement {
  const panel = el("section", "p-5 flex flex-col gap-4");
  panel.append(el("h3", "m-0 text-sm font-semibold", "Version & changelog"));

  const status = el("div", "flex items-center justify-between gap-3");
  const text = el("div", "flex flex-col gap-0.5");
  const current = el("div", "text-sm", "Checking…");
  const sub = el("div", "text-xs text-muted");
  text.append(current, sub);
  const check = el("button", "bg-black/20 text-text rounded-lg px-3 py-2 text-sm font-medium hover:bg-black/30 shrink-0", "Check now");
  check.setAttribute("type", "button");
  status.append(text, check);

  const notes = el("div", "flex flex-col gap-2");
  panel.append(status, notes);

  async function refresh(force: boolean) {
    check.setAttribute("disabled", "");
    try {
      const info = await api.version(force);
      current.textContent = `Stash Scout v${info.current}`;
      sub.textContent = versionLine(info);
      sub.className = `text-xs ${info.updateAvailable ? "text-amber" : "text-muted"}`;
      if (info.updateAvailable) {
        const link = el("a", "text-link hover:underline", " View release →") as HTMLAnchorElement;
        link.href = info.url;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        sub.appendChild(link);
      }
    } catch (err) {
      current.textContent = "Stash Scout";
      sub.textContent = `Couldn't check: ${(err as Error).message}`;
    }
    check.removeAttribute("disabled");
  }
  check.addEventListener("click", () => void refresh(true));

  void refresh(false);
  api
    .changelog()
    .then(({ markdown }) => notes.replaceChildren(renderChangelog(markdown)))
    .catch((err: Error) => notes.replaceChildren(el("p", "m-0 text-sm text-danger", `Couldn't load changelog: ${err.message}`)));
  return panel;
}
