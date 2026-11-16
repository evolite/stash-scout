type Listener = (performerId: string) => void;
let listener: Listener | undefined;

export function onNavigateToPerformer(fn: Listener): void {
  listener = fn;
}

export function navigateToPerformer(id: string): void {
  listener?.(id);
}

let studioListener: Listener | undefined;

export function onNavigateToStudio(fn: Listener): void {
  studioListener = fn;
}

export function navigateToStudio(id: string): void {
  studioListener?.(id);
}
