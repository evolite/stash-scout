import { api } from "./api.js";
import { renderNavbar, type Tab } from "./components/Navbar.js";
import { renderBrowseView } from "./views/BrowseView.js";
import { renderWatchedView } from "./views/WatchedView.js";
import { renderPerformersView } from "./views/PerformersView.js";
import { renderStudiosView } from "./views/StudiosView.js";
import { renderStatsView } from "./views/StatsView.js";
import { renderSettingsView } from "./views/SettingsView.js";
import { renderOnboardingModal } from "./components/OnboardingModal.js";
import { onNavigateToPerformer, onNavigateToStudio } from "./navigation.js";

const root = document.getElementById("root")!;
const TABS: Tab[] = ["browse", "watched", "performers", "studios", "stats", "settings"];
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
} else if (TABS.includes(savedTab as Tab)) {
  activeTab = savedTab as Tab;
} else {
  activeTab = "watched";
}

// Set either from the deep link above or by navigateToPerformer (e.g. a scene
// card's performer link) — consumed once by render() below, then cleared.
let pendingPerformerId: string | undefined = deepLinkedPerformerId;
let pendingStudioId: string | undefined = deepLinkedStudioId;

// The list tab to return to when the browser Back button pops a
// /performers/<id> or /studios/<id> entry off the history stack. Views keep
// their own state across a re-render (module-level in PerformerBrowse etc.),
// so Back lands on the same populated grid the user left.
let tabBeforeDetail: Tab | undefined;

onNavigateToPerformer((id) => {
  // Record the current tab (including "performers" itself — opening a performer
  // from the discovery grid should Back to that grid, not to some earlier tab).
  if (activeTab !== "studios") tabBeforeDetail = activeTab;
  activeTab = "performers";
  pendingPerformerId = id;
  history.pushState(null, "", `/performers/${id}`);
  render();
});

onNavigateToStudio((id) => {
  if (activeTab !== "performers" && activeTab !== "studios") tabBeforeDetail = activeTab;
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
    activeTab = tabBeforeDetail ?? (TABS.includes(savedTab as Tab) ? (savedTab as Tab) : "watched");
  }
  render();
});

function render() {
  root.innerHTML = "";
  root.appendChild(renderNavbar(activeTab, setTab, render));

  const content = document.createElement("main");
  content.className = "px-6 py-8";
  root.appendChild(content);

  if (activeTab === "browse") content.appendChild(renderBrowseView());
  else if (activeTab === "watched") content.appendChild(renderWatchedView());
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

render();

// First-run detection reuses the same "is StashDB configured" check Settings
// itself shows a status pill for — nothing else in this app works without
// it, so an unconfigured StashDB key is a reliable proxy for "this container
// was just started for the first time." Checked after the initial render
// (rather than blocking it on this fetch) since it's a one-time correction,
// not something worth delaying every normal boot for.
const ONBOARDING_DISMISSED_KEY = "onboardingDismissed";
if (localStorage.getItem(ONBOARDING_DISMISSED_KEY) !== "1") {
  const settings = await api.settings();
  if (!settings.stashdbConfigured) {
    setTab("settings");
    document.body.appendChild(
      renderOnboardingModal(() => localStorage.setItem(ONBOARDING_DISMISSED_KEY, "1")),
    );
  }
}
