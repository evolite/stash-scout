import { renderNavbar, type Tab } from "./components/Navbar.js";
import { renderBrowseView } from "./views/BrowseView.js";
import { renderWatchedView } from "./views/WatchedView.js";
import { renderFavoritesView } from "./views/FavoritesView.js";
import { renderSettingsView } from "./views/SettingsView.js";

const root = document.getElementById("root")!;
let activeTab: Tab = "watched";

function render() {
  root.innerHTML = "";
  root.appendChild(renderNavbar(activeTab, setTab));

  const content = document.createElement("main");
  content.className = "px-6 py-8";
  root.appendChild(content);

  if (activeTab === "browse") content.appendChild(renderBrowseView());
  else if (activeTab === "watched") content.appendChild(renderWatchedView(() => setTab("browse")));
  else if (activeTab === "favorites") content.appendChild(renderFavoritesView());
  else content.appendChild(renderSettingsView());
}

function setTab(tab: Tab) {
  activeTab = tab;
  render();
}

render();
