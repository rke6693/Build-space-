import { Hono } from 'hono';
import { exposeAll } from '../../core/metrics.js';

/**
 * GET /metrics — Prometheus exposition. Public by default; gate at the LB
 * with an IP allowlist if you don't want it world-readable.
 */
export function metricsRoutes(): Hono {
  const r = new Hono();
  r.get('/metrics', (c) => {
    return c.text(exposeAll(), 200, {
      'Content-Type': 'text/plain; version=0.0.4; charset=utf-8',
      'Cache-Control': 'no-store',
    });
  });
  return r;
}
