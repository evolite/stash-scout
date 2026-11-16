import { api, setSessionActive } from "./api.js";
import { renderLoginView } from "./views/LoginView.js";
import { renderNavbar, setNavbarAuthMode, setSfwMode, type Tab } from "./components/Navbar.js";
import { renderBrowseView } from "./views/BrowseView.js";
import { renderSubscribedView } from "./views/SubscribedView.js";
import { renderSubscriptionsView } from "./views/SubscriptionsView.js";
import { renderPerformersView } from "./views/PerformersView.js";
import { renderStudiosView } from "./views/StudiosView.js";
import { renderStatsView } from "./views/StatsView.js";
import { renderSettingsView } from "./views/SettingsView.js";
import { renderOnboardingModal } from "./components/OnboardingModal.js";
import { maybeShowUpdateModal } from "./components/UpdateModal.js";
import { onNavigateToPerformer, onNavigateToStudio } from "./navigation.js";
import { getReturnTab, restoreScroll, saveScroll, setReturnTab } from "./viewState.js";

const root = document.getElementById("root")!;
const TABS = new Set<Tab>(["browse", "subscribed", "subscriptions", "performers", "studios", "stats", "settings"]);
const savedTab = localStorage.getItem("activeTab");

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

let pendingPerformerId: string | undefined = deepLinkedPerformerId;
let pendingStudioId: string | undefined = deepLinkedStudioId;

onNavigateToPerformer((id) => {
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

if (__DEV_INSTANCE__) await import("./dev.css");

function renderDevBanner(): HTMLElement {
  const b = document.createElement("div");
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

  if (activeTab === "browse") content.appendChild(renderBrowseView(setTab));
  else if (activeTab === "subscribed") content.appendChild(renderSubscribedView());
  else if (activeTab === "subscriptions") content.appendChild(renderSubscriptionsView(setTab));
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

if (auth.loggedIn) void maybeShowUpdateModal();
