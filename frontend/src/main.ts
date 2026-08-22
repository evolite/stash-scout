import { api } from "./api.js";
import { renderNavbar, type Tab } from "./components/Navbar.js";
import { renderBrowseView } from "./views/BrowseView.js";
import { renderWatchedView } from "./views/WatchedView.js";
import { renderPerformersView } from "./views/PerformersView.js";
import { renderStatsView } from "./views/StatsView.js";
import { renderSettingsView } from "./views/SettingsView.js";
import { renderOnboardingModal } from "./components/OnboardingModal.js";
import { onNavigateToPerformer } from "./navigation.js";

const root = document.getElementById("root")!;
const TABS: Tab[] = ["browse", "watched", "performers", "stats", "settings"];
const savedTab = localStorage.getItem("activeTab");

// A request for /performers/<id> (typed, bookmarked, or linked from
// elsewhere) opens straight into the Performers tab pre-loaded with that
// performer — server/index.ts's catch-all already serves index.html for any
// path, so this is the only piece needed to honor it. Only read once at
// boot; in-app navigation (search box, a scene card's performer link via
// navigateToPerformer below) never touches the URL.
const deepLinkedPerformerId = window.location.pathname.match(/^\/performers\/([^/]+)$/)?.[1];
let activeTab: Tab = deepLinkedPerformerId ? "performers" : TABS.includes(savedTab as Tab) ? (savedTab as Tab) : "watched";

// Set either from the deep link above or by navigateToPerformer (e.g. a scene
// card's performer link) — consumed once by render() below, then cleared.
let pendingPerformerId: string | undefined = deepLinkedPerformerId;

onNavigateToPerformer((id) => {
  activeTab = "performers";
  pendingPerformerId = id;
  localStorage.setItem("activeTab", "performers");
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
  } else if (activeTab === "stats") content.appendChild(renderStatsView());
  else content.appendChild(renderSettingsView());
}

function setTab(tab: Tab) {
  activeTab = tab;
  localStorage.setItem("activeTab", tab);
  // Leaving Performers (e.g. after landing on a /performers/<id> deep link
  // and then clicking another tab) drops the stale path — replaceState, not
  // pushState, since a plain tab switch shouldn't add a history entry.
  if (tab !== "performers" && window.location.pathname !== "/") {
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
  api.settings().then((settings) => {
    if (settings.stashdbConfigured) return;
    setTab("settings");
    document.body.appendChild(
      renderOnboardingModal(() => localStorage.setItem(ONBOARDING_DISMISSED_KEY, "1")),
    );
  });
}
