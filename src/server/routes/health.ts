import { Hono } from 'hono';
import type { Pool } from 'pg';
import { ping } from '../../db/client.js';

export function healthRoutes(deps: {
  pool: Pool | null;
  version: string;
  demoMode: boolean;
  providers: string[];
}): Hono {
  const r = new Hono();

  r.get('/health', (c) => c.json({ status: 'ok', version: deps.version }));

  r.get('/health/ready', async (c) => {
    if (!deps.pool) return c.json({ status: 'ok', postgres: 'disabled' });
    try {
      await ping(deps.pool);
      return c.json({ status: 'ok', postgres: 'up' });
    } catch (err) {
      return c.json(
        { status: 'degraded', postgres: 'down', error: (err as Error).message },
        503,
      );
    }
  });

  // Public, unauthed: lets the dashboard adapt to demo / real-mode without a key.
  // Only exposes non-sensitive booleans + the version string.
  r.get('/v1/info', (c) =>
    c.json({
      version: deps.version,
      demo: deps.demoMode,
      providers: deps.providers,
    }),
  );

  return r;
}
