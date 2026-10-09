import { api, setSessionActive } from "./api.js";
import { renderLoginView } from "./views/LoginView.js";
import { renderNavbar, setNavbarAuthMode, setSfwMode, type Tab } from "./components/Navbar.js";
import { renderBrowseView } from "./views/BrowseView.js";
import { renderSubscribedView } from "./views/SubscribedView.js";
import { renderPerformersView } from "./views/PerformersView.js";
import { renderStudiosView } from "./views/StudiosView.js";
import { renderStatsView } from "./views/StatsView.js";
import { renderSettingsView } from "./views/SettingsView.js";
import { renderOnboardingModal } from "./components/OnboardingModal.js";
import { onNavigateToPerformer, onNavigateToStudio } from "./navigation.js";
import { getReturnTab, restoreScroll, saveScroll, setReturnTab } from "./viewState.js";

const root = document.getElementById("root")!;
const TABS = new Set<Tab>(["browse", "subscribed", "performers", "studios", "stats", "settings"]);
const savedTab = localStorage.getItem("activeTab");

// A request for /performers/<id> (typed, bookmarked, or linked from
// elsewhere) opens straight into the Performers tab pre-loaded with that
// performer — server/index.ts's catch-all already serves index.html for any
// path, so this is the only piece needed to honor it. Only read once at
// boot; in-app navigation (search box, a scene card's performer link via
// navigateToPerformer below) never touches the URL.
const deepLinkedPerformerId = /^\/performers\/([^/]+)$/.exec(window.location.pathname)?.[1];
const deepLinkedStudioId = /^\/studios\/([^/]+)$/.exec(window.location.pathname)?.[1];
let activeTab: Tab;
if (deepLinkedPerformerId) {
  activeTab = "performers";
} else if (deepLinkedStudioId) {
  activeTab = "studios";
} else if (TABS.has(savedTab as Tab)) {
  activeTab = savedTab as Tab;
} else {
  activeTab = "subscribed";
}

// Set either from the deep link above or by navigateToPerformer (e.g. a scene
// card's performer link) — consumed once by render() below, then cleared.
let pendingPerformerId: string | undefined = deepLinkedPerformerId;
let pendingStudioId: string | undefined = deepLinkedStudioId;

// The tab Back returns to (setReturnTab) and each view's state (getState) live in
// viewState.ts, so Back lands on the same populated view the user left.

onNavigateToPerformer((id) => {
  // Record the current tab (including "performers" itself — opening a performer
  // from the discovery grid should Back to that grid, not to some earlier tab).
  setReturnTab(activeTab);
  saveScroll();
  activeTab = "performers";
  pendingPerformerId = id;
  history.pushState(null, "", `/performers/${id}`);
  render();
});

onNavigateToStudio((id) => {
  if (activeTab !== "performers" && activeTab !== "studios") setReturnTab(activeTab);
  saveScroll();
  activeTab = "studios";
  pendingStudioId = id;
  history.pushState(null, "", `/studios/${id}`);
  render();
});

window.addEventListener("popstate", () => {
  const perf = /^\/performers\/([^/]+)$/.exec(window.location.pathname)?.[1];
  const studio = /^\/studios\/([^/]+)$/.exec(window.location.pathname)?.[1];
  if (perf) {
    activeTab = "performers";
    pendingPerformerId = perf;
  } else if (studio) {
    activeTab = "studios";
    pendingStudioId = studio;
  } else {
    activeTab = (getReturnTab() as Tab | undefined) ?? (TABS.has(savedTab as Tab) ? (savedTab as Tab) : "subscribed");
  }
  render();
  restoreScroll();
});

// Dev-only (__DEV_INSTANCE__ is false in the build, so all of this is stripped):
// red DEV banner, heavy-redaction CSS, and blur mode re-forced on every render()
// (i.e. every navigation) — the toggle can be switched off but never sticks.
if (__DEV_INSTANCE__) await import("./dev.css");

function renderDevBanner(): HTMLElement {
  const b = document.createElement("div");
  // inline styles, not Tailwind classes: the scanner would ship those utilities in release CSS too
  b.style.cssText = "background:#dc2626;color:#fff;text-align:center;font:700 12px sans-serif;letter-spacing:.2em;padding:4px";
  b.textContent = "DEV";
  return b;
}

function render() {
  root.innerHTML = "";
  if (__DEV_INSTANCE__) {
    setSfwMode(true);
    root.appendChild(renderDevBanner());
  }
  root.appendChild(renderNavbar(activeTab, setTab, render));

  const content = document.createElement("main");
  content.className = "px-6 py-8";
  root.appendChild(content);

  if (activeTab === "browse") content.appendChild(renderBrowseView());
  else if (activeTab === "subscribed") content.appendChild(renderSubscribedView());
  else if (activeTab === "performers") {
    content.appendChild(renderPerformersView(pendingPerformerId));
    pendingPerformerId = undefined;
  } else if (activeTab === "studios") {
    content.appendChild(renderStudiosView(pendingStudioId));
    pendingStudioId = undefined;
  } else if (activeTab === "stats") content.appendChild(renderStatsView());
  else content.appendChild(renderSettingsView());
}

function setTab(tab: Tab) {
  activeTab = tab;
  localStorage.setItem("activeTab", tab);
  // Leaving Performers (e.g. after landing on a /performers/<id> deep link
  // and then clicking another tab) drops the stale path — replaceState, not
  // pushState, since a plain tab switch shouldn't add a history entry.
  if (tab !== "studios" && window.location.pathname !== "/") {
    history.replaceState(null, "", "/");
  }
  render();
}

const auth = await api.authStatus();
setNavbarAuthMode(auth.mode);
setSessionActive(auth.loggedIn);
if (!auth.loggedIn) {
  root.appendChild(renderLoginView(auth.mode, () => location.reload()));
} else {
  render();
}

// First-run detection reuses the same "is StashDB configured" check Settings
// itself shows a status pill for — nothing else in this app works without
// it, so an unconfigured StashDB key is a reliable proxy for "this container
// was just started for the first time." Checked after the initial render
// (rather than blocking it on this fetch) since it's a one-time correction,
// not something worth delaying every normal boot for.
const ONBOARDING_DISMISSED_KEY = "onboardingDismissed";
if (auth.loggedIn && localStorage.getItem(ONBOARDING_DISMISSED_KEY) !== "1") {
  const settings = await api.settings();
  if (!settings.stashdbConfigured) {
    setTab("settings");
    document.body.appendChild(
      renderOnboardingModal(() => localStorage.setItem(ONBOARDING_DISMISSED_KEY, "1")),
    );
  }
}
