import { renderPerformerBrowse } from "../components/PerformerBrowse.js";

// The Performers tab is the attribute-search grid (renderPerformerBrowse) with
// its filter sidebar; opening a performer swaps the right column to their
// scenes while the sidebar stays. `initialId` (a /performers/<id> deep link or
// a performer link elsewhere in the app) opens straight into that detail view.
export function renderPerformersView(initialId?: string): HTMLElement {
  return renderPerformerBrowse(initialId);
}
