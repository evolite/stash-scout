// Shared by every module-level cache Map in this app (stashdbClient,
// localStashClient, the auth rate-limiter) — none of them had a size bound,
// so a caller varying the cache key on every request (a different `text=`,
// a different client IP) could grow them forever. FIFO eviction, not real
// LRU: good enough for "bound memory," not worth a doubly-linked-list.
export function capMap<K, V>(map: Map<K, V>, maxEntries: number): void {
  while (map.size > maxEntries) {
    const oldestKey = map.keys().next().value;
    if (oldestKey === undefined) break;
    map.delete(oldestKey);
  }
}
