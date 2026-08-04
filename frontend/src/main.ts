import { renderNavbar, type Tab } from "./components/Navbar.js";
import { renderBrowseView } from "./views/BrowseView.js";
import { renderWatchedView } from "./views/WatchedView.js";
import { renderSettingsView } from "./views/SettingsView.js";

const root = document.getElementById("root")!;
let activeTab: Tab = "watched";

function render() {
  root.innerHTML = "";
  root.appendChild(renderNavbar(activeTab, setTab));

  const content = document.createElement("main");
  content.className = "MainContent";
  root.appendChild(content);

  if (activeTab === "browse") content.appendChild(renderBrowseView());
  else if (activeTab === "watched") content.appendChild(renderWatchedView(() => setTab("browse")));
  else content.appendChild(renderSettingsView());
}

function setTab(tab: Tab) {
  activeTab = tab;
  render();
}

render();
