import { renderPerformerBrowse } from "../components/PerformerBrowse.js";

export function renderPerformersView(initialId?: string): HTMLElement {
  return renderPerformerBrowse(initialId);
}
