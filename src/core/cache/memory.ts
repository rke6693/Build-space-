import type { CompletionRequest, CompletionResponse } from '../types.js';
import { type Cache, type CacheHit, cacheKey, isCacheable, promptHash } from './cache.js';

interface Entry {
  response: CompletionResponse;
  expiresAt: number;
}

/**
 * LRU + TTL exact-match cache. No semantic matching — memory cache is for dev
 * and for deployments without Postgres. Keyed by `${cacheKey}:${promptHash}`.
 */
export class MemoryCache implements Cache {
  private readonly map = new Map<string, Entry>();
  private readonly maxEntries: number;
  private readonly ttlMs: number;

  constructor(opts: { maxEntries?: number; ttlSeconds?: number } = {}) {
    this.maxEntries = opts.maxEntries ?? 10_000;
    this.ttlMs = (opts.ttlSeconds ?? 86_400) * 1000;
  }

  async lookup(req: CompletionRequest): Promise<CacheHit | null> {
    if (!isCacheable(req)) return null;
    const key = `${cacheKey(req)}:${promptHash(req)}`;
    const entry = this.map.get(key);
    if (!entry) return null;
    if (entry.expiresAt < Date.now()) {
      this.map.delete(key);
      return null;
    }
    // Refresh LRU position.
    this.map.delete(key);
    this.map.set(key, entry);
    return { response: entry.response, status: 'exact' };
  }

  async store(req: CompletionRequest, res: CompletionResponse): Promise<void> {
    if (!isCacheable(req)) return;
    const key = `${cacheKey(req)}:${promptHash(req)}`;
    if (this.map.size >= this.maxEntries) {
      const oldest = this.map.keys().next().value;
      if (oldest !== undefined) this.map.delete(oldest);
    }
    this.map.set(key, { response: res, expiresAt: Date.now() + this.ttlMs });
  }

  /** Test / admin helper. */
  size(): number {
    return this.map.size;
  }

  /** Test / admin helper. */
  clear(): void {
    this.map.clear();
  }
}
