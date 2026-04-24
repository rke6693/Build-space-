import { Hono } from 'hono';
import type { ShadowStats } from '../../core/shadow/stats.js';
import type { Repo } from '../../db/repo.js';
import type { AuthContext } from '../middleware/auth.js';

export function statsRoutes(deps: {
  repo: Repo | null;
  shadowStats: ShadowStats;
}): Hono<{ Variables: { auth: AuthContext } }> {
  const r = new Hono<{ Variables: { auth: AuthContext } }>();

  r.get('/v1/stats', async (c) => {
    const shadow = deps.shadowStats.snapshot();
    if (!deps.repo) {
      return c.json({
        requests_24h: null,
        note: 'Postgres not configured; request stats unavailable.',
        shadow,
      });
    }
    const s = await deps.repo.stats24h();
    return c.json({
      requests_24h: s.requests,
      cache_hit_rate: s.cacheHitRate,
      total_cost_usd: s.totalCostUsd,
      saved_by_cache_usd: s.savedByCache,
      avg_latency_ms: s.avgLatencyMs,
      shadow,
    });
  });

  return r;
}
