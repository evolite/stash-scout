// Lets components deep in the tree (e.g. SceneCard's performer links) trigger
// a tab switch without importing main.ts directly — main.ts owns activeTab
// and, via SceneSection.ts, already imports SceneCard.ts, so a direct
// SceneCard -> main.ts import would be circular.
type Listener = (performerId: string) => void;
let listener: Listener | undefined;

export function onNavigateToPerformer(fn: Listener): void {
  listener = fn;
}

export function navigateToPerformer(id: string): void {
  listener?.(id);
}
