import type { MiddlewareHandler } from 'hono';
import { KeelError } from '../../util/errors.js';
import type { AuthContext } from './auth.js';

/**
 * Token-bucket rate limiter, in-memory, keyed by api_key_id.
 *
 * Each key gets a bucket with `capacity` tokens that refills at
 * `refillRatePerSec`. Each request consumes one token. When empty, requests
 * fail with 429.
 *
 * In-memory means this DOES NOT share state across processes — fine for
 * single-node OSS / Cloud-tier deployments. For multi-node deployments,
 * swap in a Redis-backed implementation behind the same interface (see
 * docs/ARCHITECTURE.md). The interface is intentionally narrow.
 *
 * Resets on process restart (acceptable: limits are about preventing abuse,
 * not perfect accounting).
 */

interface Bucket {
  tokens: number;
  lastRefillMs: number;
}

export interface RateLimiterOptions {
  /** Max tokens in the bucket per key. Burst size. */
  capacity: number;
  /** Tokens added per second. Steady-state rate. */
  refillRatePerSec: number;
  /** Max distinct keys to track in memory. LRU-evict above this. */
  maxKeys?: number;
}

export class TokenBucketLimiter {
  private readonly buckets = new Map<string, Bucket>();
  private readonly capacity: number;
  private readonly refillRate: number;
  private readonly maxKeys: number;

  constructor(opts: RateLimiterOptions) {
    this.capacity = opts.capacity;
    this.refillRate = opts.refillRatePerSec;
    this.maxKeys = opts.maxKeys ?? 100_000;
  }

  /** Returns true if allowed, false if rate-limited. */
  consume(key: string, cost = 1): { allowed: boolean; retryAfterMs: number } {
    const now = Date.now();
    let bucket = this.buckets.get(key);
    if (!bucket) {
      if (this.buckets.size >= this.maxKeys) {
        // LRU-evict oldest.
        const oldest = this.buckets.keys().next().value;
        if (oldest !== undefined) this.buckets.delete(oldest);
      }
      bucket = { tokens: this.capacity, lastRefillMs: now };
      this.buckets.set(key, bucket);
    } else {
      // Refill.
      const elapsedSec = (now - bucket.lastRefillMs) / 1000;
      bucket.tokens = Math.min(this.capacity, bucket.tokens + elapsedSec * this.refillRate);
      bucket.lastRefillMs = now;
      // Refresh LRU position.
      this.buckets.delete(key);
      this.buckets.set(key, bucket);
    }
    if (bucket.tokens < cost) {
      const deficit = cost - bucket.tokens;
      const retryAfterMs = Math.ceil((deficit / this.refillRate) * 1000);
      return { allowed: false, retryAfterMs };
    }
    bucket.tokens -= cost;
    return { allowed: true, retryAfterMs: 0 };
  }

  /** Test/admin helper. */
  size(): number {
    return this.buckets.size;
  }
}

export function rateLimit(
  limiter: TokenBucketLimiter,
): MiddlewareHandler<{ Variables: { auth: AuthContext } }> {
  return async (c, next) => {
    const auth = c.get('auth');
    const result = limiter.consume(auth.apiKeyId);
    if (!result.allowed) {
      // Hono allows headers on thrown errors via the response from the
      // error handler; here we set them on the response and throw.
      c.header('Retry-After', String(Math.ceil(result.retryAfterMs / 1000)));
      throw new KeelError('rate_limited', 'rate limit exceeded', {
        details: { retry_after_ms: result.retryAfterMs },
      });
    }
    await next();
  };
}
