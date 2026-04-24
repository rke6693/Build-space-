import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import type { Pool } from 'pg';
import type { Cache } from '../core/cache/cache.js';
import type { ProviderRegistry } from '../core/providers/base.js';
import { Router } from '../core/router.js';
import type { ShadowController } from '../core/shadow/shadow.js';
import type { ShadowStats } from '../core/shadow/stats.js';
import type { Repo } from '../db/repo.js';
import { logger } from '../util/logger.js';
import { auth, type AuthContext } from './middleware/auth.js';
import { errorHandler } from './middleware/errors.js';
import { chatRoutes } from './routes/chat.js';
import { healthRoutes } from './routes/health.js';
import { messagesRoutes } from './routes/messages.js';
import { statsRoutes } from './routes/stats.js';

export interface AppDeps {
  registry: ProviderRegistry;
  cache: Cache;
  shadow: ShadowController | null;
  shadowStats: ShadowStats;
  repo: Repo | null;
  pool: Pool | null;
  staticApiKeys: string[];
  routingOverrides: Record<string, string>;
  version: string;
  /** Serve the static landing page + brand assets at `/`. Defaults to true. */
  serveLanding?: boolean;
}

/** Create a fully-wired Hono app. Pure function — no side effects. */
export function createApp(deps: AppDeps): Hono {
  const app = new Hono<{ Variables: { auth: AuthContext } }>();

  app.use('*', async (c, next) => {
    const started = Date.now();
    await next();
    logger.info(
      {
        method: c.req.method,
        path: c.req.path,
        status: c.res.status,
        ms: Date.now() - started,
      },
      'request',
    );
  });

  app.onError(errorHandler);

  // Public health routes (no auth).
  app.route('/', healthRoutes({ pool: deps.pool, version: deps.version }));

  // Landing page + brand assets (optional, on by default). Serves the hand-
  // built static site in `web/` plus `brand/` for the logo/tokens. The
  // gateway's API routes take precedence because they're registered later.
  if (deps.serveLanding !== false) {
    app.use('/brand/*', serveStatic({ root: './' }));
    app.use('/styles.css', serveStatic({ path: './web/styles.css' }));
    app.get('/', serveStatic({ path: './web/index.html' }));
  }

  // Authed routes.
  const authed = new Hono<{ Variables: { auth: AuthContext } }>();
  authed.use('*', auth({ staticKeys: deps.staticApiKeys, repo: deps.repo }));

  const router = new Router({
    registry: deps.registry,
    cache: deps.cache,
    shadow: deps.shadow,
    overrides: deps.routingOverrides,
  });

  authed.route('/', chatRoutes({ router, repo: deps.repo }));
  authed.route('/', messagesRoutes({ router, repo: deps.repo }));
  authed.route('/', statsRoutes({ repo: deps.repo, shadowStats: deps.shadowStats }));

  app.route('/', authed);

  return app;
}
