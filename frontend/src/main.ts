import { renderNavbar, type Tab } from "./components/Navbar.js";
import { renderBrowseView } from "./views/BrowseView.js";
import { renderWatchedView } from "./views/WatchedView.js";
import { renderStatsView } from "./views/StatsView.js";
import { renderSettingsView } from "./views/SettingsView.js";

const root = document.getElementById("root")!;
const TABS: Tab[] = ["browse", "watched", "stats", "settings"];
const savedTab = localStorage.getItem("activeTab");
let activeTab: Tab = TABS.includes(savedTab as Tab) ? (savedTab as Tab) : "watched";

function render() {
  root.innerHTML = "";
  root.appendChild(renderNavbar(activeTab, setTab, render));

  const content = document.createElement("main");
  content.className = "px-6 py-8";
  root.appendChild(content);

  if (activeTab === "browse") content.appendChild(renderBrowseView());
  else if (activeTab === "watched") content.appendChild(renderWatchedView());
  else if (activeTab === "stats") content.appendChild(renderStatsView());
  else content.appendChild(renderSettingsView());
}

function setTab(tab: Tab) {
  activeTab = tab;
  localStorage.setItem("activeTab", tab);
  render();
}

render();
