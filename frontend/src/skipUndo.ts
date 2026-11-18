export type Restore = () => boolean;

const restorers = new Map<string, Restore>();

export function rememberSkip(id: string, restore: Restore | void): void {
  if (restore) restorers.set(id, restore);
}

export function restoreSkipped(id: string): boolean {
  const restore = restorers.get(id);
  restorers.delete(id);
  return restore?.() ?? false;
}
