import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

// In local/dev without Upstash configured, fall back to an in-memory limiter.
// Production deployments MUST set UPSTASH_REDIS_REST_URL to avoid per-instance bypass.

type Limiter = {
  limit: (key: string) => Promise<{ success: boolean; remaining: number; reset: number }>;
};

function memoryLimiter(max: number, windowMs: number): Limiter {
  const buckets = new Map<string, { count: number; reset: number }>();
  return {
    async limit(key: string) {
      const now = Date.now();
      const b = buckets.get(key);
      if (!b || b.reset < now) {
        buckets.set(key, { count: 1, reset: now + windowMs });
        return { success: true, remaining: max - 1, reset: now + windowMs };
      }
      b.count += 1;
      return { success: b.count <= max, remaining: Math.max(0, max - b.count), reset: b.reset };
    },
  };
}

function upstashLimiter(max: number, window: `${number} ${'s' | 'm' | 'h'}`, prefix: string): Limiter {
  const redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL!,
    token: process.env.UPSTASH_REDIS_REST_TOKEN!,
  });
  const rl = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(max, window),
    analytics: false,
    prefix,
  });
  return {
    async limit(key: string) {
      const r = await rl.limit(key);
      return { success: r.success, remaining: r.remaining, reset: r.reset };
    },
  };
}

const hasUpstash = !!process.env.UPSTASH_REDIS_REST_URL && !!process.env.UPSTASH_REDIS_REST_TOKEN;

// Conservative defaults. Tune per-route as real traffic emerges.
export const limiters = {
  // Magic-link / login attempts: 5 per minute per IP+email, stops link stuffing.
  auth: hasUpstash ? upstashLimiter(5, '1 m', 'rl:auth') : memoryLimiter(5, 60_000),
  // General authenticated API: 60 req/min per user.
  api: hasUpstash ? upstashLimiter(60, '1 m', 'rl:api') : memoryLimiter(60, 60_000),
  // Score submits: 20/min per user (one run ends ~every 30-60s in practice).
  score: hasUpstash ? upstashLimiter(20, '1 m', 'rl:score') : memoryLimiter(20, 60_000),
  // Leaderboard reads (unauthed allowed): 30/min per IP.
  leaderboard: hasUpstash ? upstashLimiter(30, '1 m', 'rl:lb') : memoryLimiter(30, 60_000),
  // Webhook fallback (Stripe): high ceiling, only to mitigate flood attacks.
  webhook: hasUpstash ? upstashLimiter(200, '1 m', 'rl:wh') : memoryLimiter(200, 60_000),
};

export function clientIp(req: Request): string {
  const xff = req.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0]!.trim();
  const real = req.headers.get('x-real-ip');
  if (real) return real.trim();
  return 'unknown';
}
