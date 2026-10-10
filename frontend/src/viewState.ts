// In-memory view state that survives render() (which rebuilds every view from
// scratch on navigation / Back). Same lifetime as PerformerBrowse's persisted*
// vars: lost on a full reload. Mutate the returned object in place.
const store = new Map<string, unknown>();

export function getState<T>(key: string, init: T): T {
  if (!store.has(key)) store.set(key, init);
  return store.get(key) as T;
}

// Tab to return to when Back pops a /performers/<id> or /studios/<id> entry.
let returnTab: string | undefined;
export const setReturnTab = (tab: string | undefined): void => {
  returnTab = tab;
};
export const getReturnTab = (): string | undefined => returnTab;

let savedScrollY = 0;
export function saveScroll(): void {
  savedScrollY = window.scrollY;
}

// Content loads async, so keep retrying until the page is tall enough (max ~3s).
export function restoreScroll(): void {
  const y = savedScrollY;
  savedScrollY = 0;
  if (!y) return;
  const t0 = performance.now();
  const tick = () => {
    window.scrollTo(0, y);
    if (Math.abs(window.scrollY - y) > 2 && performance.now() - t0 < 3000) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

// Scenes filter-builder mode, set by the Subscriptions tab: "new" saves the
// drafted filter as a subscription, "edit" updates the subscription `id`.
// Outside these modes Scenes is a plain browser with no save controls.
export type SubscriptionMode = { mode: "none" | "new" | "edit"; id?: string };
const subscriptionMode = getState<SubscriptionMode>("subscriptionMode", { mode: "none" });
export const getSubscriptionMode = (): Readonly<SubscriptionMode> => subscriptionMode;
export function setSubscriptionMode(mode: SubscriptionMode["mode"], id?: string): void {
  subscriptionMode.mode = mode;
  subscriptionMode.id = id;
}
