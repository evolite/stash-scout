import type { AppConfig } from "./config.js";

export interface WhisparrScene {
  id: number;
  stashId?: string;
  foreignId?: string;
  monitored: boolean;
  hasFile: boolean;
  title?: string;
  added?: string;
}

export interface WhisparrQueueItem {
  id: number;
  movieId: number;
  size?: number;
  sizeleft?: number;
  status?: string;
  trackedDownloadState?: string;
}

const MOVIE_CACHE_TTL_MS = 30_000;
const QUEUE_CACHE_TTL_MS = 5_000;

// Backs the async request-reply flow for Add/Monitor/Unmonitor: the route
// handler responds before this settles, so a failure has nowhere to go but
// here. Keyed by stashId (addScene, no movieId yet) or String(movieId)
// (setMonitored). Consumed (deleted) on read by getSceneStatus, so a failure
// surfaces for exactly one status poll before reverting to the real state.
const ERROR_TTL_MS = 30_000;
const recentErrors = new Map<string, { message: string; expiresAt: number }>();

export function recordWhisparrError(key: string, message: string): void {
  recentErrors.set(key, { message, expiresAt: Date.now() + ERROR_TTL_MS });
}

export function consumeWhisparrError(key: string): string | undefined {
  const entry = recentErrors.get(key);
  if (!entry) return undefined;
  recentErrors.delete(key);
  return entry.expiresAt >= Date.now() ? entry.message : undefined;
}

// 5 attempts total, incremental backoff — most Whisparr hiccups are
// transient, so retry in the background before making the client show a
// failure for what the next request would've fixed anyway.
const RETRY_DELAYS_MS = [1000, 2000, 4000, 8000];

export async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt === RETRY_DELAYS_MS.length) throw err;
      await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[attempt]));
    }
  }
}

// A hung/unresponsive Whisparr otherwise leaves fetch() pending indefinitely —
// Node's fetch has no default timeout.
const FETCH_TIMEOUT_MS = 15_000;

// Ported from stashgifs/src/WhisparrClient.ts, trimmed to what the backend needs.
export class WhisparrClient {
  private movieListCache?: { fetchedAt: number; promise: Promise<WhisparrScene[]> };
  private queueCache?: { fetchedAt: number; promise: Promise<WhisparrQueueItem[]> };

  constructor(private readonly cfg: AppConfig) {}

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    let base = this.cfg.whisparrBaseUrl!;
    while (base.endsWith("/")) base = base.slice(0, -1);
    const url = `${base}/api/v3${path}`;
    const headers = new Headers(init.headers);
    headers.set("X-Api-Key", this.cfg.whisparrApiKey!);
    if (this.cfg.cfAccessClientId && this.cfg.cfAccessClientSecret) {
      headers.set("CF-Access-Client-Id", this.cfg.cfAccessClientId);
      headers.set("CF-Access-Client-Secret", this.cfg.cfAccessClientSecret);
    }
    if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
    const res = await fetch(url, { ...init, headers, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!res.ok) throw new Error(`Whisparr ${init.method ?? "GET"} ${path} failed: HTTP ${res.status}`);
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  }

  async getRootFolders() {
    return this.request<{ id: number; path: string }[]>("/rootfolder");
  }

  async getQualityProfiles() {
    return this.request<{ id: number; name: string }[]>("/qualityprofile");
  }

  private getMovieList(): Promise<WhisparrScene[]> {
    const now = Date.now();
    if (this.movieListCache && now - this.movieListCache.fetchedAt < MOVIE_CACHE_TTL_MS) {
      return this.movieListCache.promise;
    }
    const promise = this.request<WhisparrScene[]>("/movie").catch((err) => {
      this.movieListCache = undefined;
      throw err;
    });
    this.movieListCache = { fetchedAt: now, promise };
    return promise;
  }

  async getSceneByStashId(stashId: string): Promise<WhisparrScene | null> {
    const list = await this.getMovieList();
    return list.find((m) => m.stashId === stashId || m.foreignId === stashId) ?? null;
  }

  private getQueue(): Promise<WhisparrQueueItem[]> {
    const now = Date.now();
    if (this.queueCache && now - this.queueCache.fetchedAt < QUEUE_CACHE_TTL_MS) {
      return this.queueCache.promise;
    }
    const promise = this.request<{ records?: WhisparrQueueItem[] } | WhisparrQueueItem[]>("/queue/details?includeMovie=false")
      .then((data) => (Array.isArray(data) ? data : data.records ?? []))
      .catch((err) => {
        this.queueCache = undefined;
        throw err;
      });
    this.queueCache = { fetchedAt: now, promise };
    return promise;
  }

  async getQueueForMovie(movieId: number): Promise<WhisparrQueueItem | null> {
    const queue = await this.getQueue();
    return queue.find((q) => q.movieId === movieId) ?? null;
  }

  // For the stats dashboard's bulk classification — reuses the same cached
  // movie list / queue every per-scene status check already fetches, instead
  // of adding new Whisparr calls.
  async getBulkStatusSource(): Promise<{ movies: WhisparrScene[]; queue: WhisparrQueueItem[] }> {
    const [movies, queue] = await Promise.all([this.getMovieList(), this.getQueue()]);
    return { movies, queue };
  }

  async setMonitored(movieId: number, monitored: boolean): Promise<WhisparrScene> {
    const list = await this.getMovieList();
    const movie = list.find((m) => m.id === movieId);
    if (!movie) throw new Error(`Whisparr movie ${movieId} not found`);
    const updated = await this.request<WhisparrScene>(`/movie/${movieId}`, {
      method: "PUT",
      body: JSON.stringify({ ...movie, monitored }),
    });
    this.movieListCache = undefined;
    return updated;
  }

  async addScene(stashId: string): Promise<WhisparrScene> {
    if (!this.cfg.whisparrRootFolderPath || typeof this.cfg.whisparrQualityProfileId !== "number") {
      throw new Error("Whisparr is not fully configured (missing root folder or quality profile).");
    }
    const body = {
      foreignId: stashId,
      stashId,
      monitored: true,
      qualityProfileId: this.cfg.whisparrQualityProfileId,
      rootFolderPath: this.cfg.whisparrRootFolderPath,
      tags: [],
      title: "added via Stash Scout",
      addOptions: { monitor: "none", searchForMovie: true },
    };
    const result = await this.request<WhisparrScene>("/movie", { method: "POST", body: JSON.stringify(body) });
    this.movieListCache = undefined;
    return result;
  }

  async testConnection(): Promise<boolean> {
    try {
      await this.request("/system/status");
      return true;
    } catch {
      return false;
    }
  }
}
