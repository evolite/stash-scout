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

// A hung/unresponsive Whisparr otherwise leaves fetch() pending indefinitely —
// Node's fetch has no default timeout.
const FETCH_TIMEOUT_MS = 15_000;

// Ported from stashgifs/src/WhisparrClient.ts, trimmed to what the backend needs.
export class WhisparrClient {
  private movieListCache?: { fetchedAt: number; promise: Promise<WhisparrScene[]> };
  private queueCache?: { fetchedAt: number; promise: Promise<WhisparrQueueItem[]> };
  // O(1) lookups per scene instead of a linear scan of the whole library; rebuilt
  // only when the underlying array changes.
  private movieIndex?: { list: WhisparrScene[]; byKey: Map<string, WhisparrScene>; byId: Map<number, WhisparrScene> };
  private queueIndex?: { list: WhisparrQueueItem[]; byMovieId: Map<number, WhisparrQueueItem> };

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
    return (await this.getMovieIndex()).byKey.get(stashId) ?? null;
  }

  private async getMovieIndex() {
    const list = await this.getMovieList();
    if (this.movieIndex?.list !== list) {
      const byKey = new Map<string, WhisparrScene>();
      const byId = new Map<number, WhisparrScene>();
      for (const m of list) {
        // first match wins, as the old list.find did
        if (m.stashId && !byKey.has(m.stashId)) byKey.set(m.stashId, m);
        if (m.foreignId && !byKey.has(m.foreignId)) byKey.set(m.foreignId, m);
        byId.set(m.id, m);
      }
      this.movieIndex = { list, byKey, byId };
    }
    return this.movieIndex;
  }

  // Swap the mutated movie into the cached list so the next status check
  // doesn't re-download the whole /movie library.
  private async patchMovie(movie: WhisparrScene) {
    const cache = this.movieListCache;
    if (!cache) return;
    const list = await cache.promise.catch(() => undefined);
    if (!list || this.movieListCache !== cache) return;
    const i = list.findIndex((m) => m.id === movie.id);
    if (i >= 0) list[i] = movie;
    else list.push(movie);
    this.movieIndex = undefined;
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
    if (this.queueIndex?.list !== queue) {
      const byMovieId = new Map<number, WhisparrQueueItem>();
      for (const q of queue) if (!byMovieId.has(q.movieId)) byMovieId.set(q.movieId, q);
      this.queueIndex = { list: queue, byMovieId };
    }
    return this.queueIndex.byMovieId.get(movieId) ?? null;
  }

  // For the stats dashboard's bulk classification — reuses the same cached
  // movie list / queue every per-scene status check already fetches, instead
  // of adding new Whisparr calls.
  async getBulkStatusSource(): Promise<{ movies: WhisparrScene[]; queue: WhisparrQueueItem[] }> {
    const [movies, queue] = await Promise.all([this.getMovieList(), this.getQueue()]);
    return { movies, queue };
  }

  async setMonitored(movieId: number, monitored: boolean): Promise<WhisparrScene> {
    const movie = (await this.getMovieIndex()).byId.get(movieId);
    if (!movie) throw new Error(`Whisparr movie ${movieId} not found`);
    const updated = await this.request<WhisparrScene>(`/movie/${movieId}`, {
      method: "PUT",
      body: JSON.stringify({ ...movie, monitored }),
    });
    await this.patchMovie(updated);
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
    await this.patchMovie(result);
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
