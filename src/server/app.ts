import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { Pool } from 'pg';
import type { Cache } from '../core/cache/cache.js';
import { registry as metrics } from '../core/metrics.js';
import type { ProviderRegistry } from '../core/providers/base.js';
import { Router } from '../core/router.js';
import type { ShadowController } from '../core/shadow/shadow.js';
import type { ShadowStats } from '../core/shadow/stats.js';
import type { Repo } from '../db/repo.js';
import { logger } from '../util/logger.js';
import { auth, type AuthContext } from './middleware/auth.js';
import { errorHandler } from './middleware/errors.js';
import { rateLimit, TokenBucketLimiter } from './middleware/rateLimit.js';
import { sizeLimit } from './middleware/sizeLimit.js';
import { chatRoutes } from './routes/chat.js';
import { healthRoutes } from './routes/health.js';
import { messagesRoutes } from './routes/messages.js';
import { metricsRoutes } from './routes/metrics.js';
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
  /** Per-key rate limiting. Set to null to disable (not recommended in prod). */
  rateLimit?: { capacity: number; refillRatePerSec: number } | null;
  /** Hard cap on request body size in bytes. Default 1 MiB. */
  maxBodyBytes?: number;
  /** CORS allowed origins. Default '*' (open). Set to specific origins for prod. */
  corsOrigins?: string | string[];
  /** Tagged in /v1/info so the dashboard can adapt UI to demo mode. */
  demoMode?: boolean;
}

/** Create a fully-wired Hono app. Pure function — no side effects. */
export function createApp(deps: AppDeps): Hono {
  const app = new Hono<{ Variables: { auth: AuthContext } }>();

  // Global request observability: log + record latency histogram.
  app.use('*', async (c, next) => {
    const started = Date.now();
    await next();
    const ms = Date.now() - started;
    const status = c.res.status;
    logger.info(
      { method: c.req.method, path: c.req.path, status, ms },
      'request',
    );
    metrics.requests.inc({ path: normalizePath(c.req.path), status: String(status) });
    metrics.latencyMs.observe(ms, { path: normalizePath(c.req.path) });
    if (status >= 400) {
      metrics.errors.inc({ status: String(status) });
    }
  });

  // CORS — open by default (this is an API gateway). Tighten in prod via env.
  app.use(
    '/v1/*',
    cors({
      origin: deps.corsOrigins ?? '*',
      allowMethods: ['POST', 'GET', 'OPTIONS'],
      allowHeaders: ['authorization', 'content-type', 'x-api-key'],
      maxAge: 600,
    }),
  );

  app.onError(errorHandler);

  // Public, no-auth routes.
  app.route(
    '/',
    healthRoutes({
      pool: deps.pool,
      version: deps.version,
      demoMode: deps.demoMode === true,
      providers: deps.registry.available(),
    }),
  );
  app.route('/', metricsRoutes());

  // Landing page + brand assets (optional, on by default). Serves the hand-
  // built static site in `web/` plus `brand/` for the logo/tokens. The
  // gateway's API routes take precedence because they're registered later.
  if (deps.serveLanding !== false) {
    app.use('/brand/*', serveStatic({ root: './' }));
    app.use('/styles.css', serveStatic({ path: './web/styles.css' }));
    // Live dashboard. Static SPA; auth happens client-side via the same
    // Bearer token used for /v1/stats. /v1/stats is on the authed sub-app
    // below, so the dashboard remains useless without a valid key.
    app.use('/dashboard/*', serveStatic({ root: './web' }));
    app.get('/dashboard', (c) => c.redirect('/dashboard/'));
    app.get('/', serveStatic({ path: './web/index.html' }));
  }

  // Authed routes.
  const authed = new Hono<{ Variables: { auth: AuthContext } }>();
  authed.use('*', sizeLimit(deps.maxBodyBytes ?? 1024 * 1024));
  authed.use('*', auth({ staticKeys: deps.staticApiKeys, repo: deps.repo }));
  if (deps.rateLimit !== null) {
    const rl = deps.rateLimit ?? { capacity: 60, refillRatePerSec: 1 };
    authed.use('*', rateLimit(new TokenBucketLimiter(rl)));
  }

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

/**
 * Normalize variable path segments so we don't blow up Prometheus cardinality.
 * Today Keel has no variable segments in paths, but futureproof for /v1/keys/:id.
 */
function normalizePath(p: string): string {
  // Match UUIDs and hex IDs and replace with :id
  return p.replace(
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
    ':id',
  );
}
