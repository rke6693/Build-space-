import { serve } from '@hono/node-server';
import { MemoryCache } from '../core/cache/memory.js';
import { ProviderEmbedder } from '../core/cache/embed.js';
import { PostgresCache } from '../core/cache/postgres.js';
import type { Cache } from '../core/cache/cache.js';
import { AnthropicProvider } from '../core/providers/anthropic.js';
import type { Provider } from '../core/providers/base.js';
import { OpenAIProvider } from '../core/providers/openai.js';
import { StaticProviderRegistry } from '../core/providers/registry.js';
import { LlmJudge } from '../core/shadow/judge.js';
import { ShadowController, StaticShadowPlan } from '../core/shadow/shadow.js';
import { ShadowStats } from '../core/shadow/stats.js';
import { createPool } from '../db/client.js';
import { Repo } from '../db/repo.js';
import { loadConfig } from '../config.js';
import { logger } from '../util/logger.js';
import { createApp } from './app.js';

async function main(): Promise<void> {
  const cfg = loadConfig();

  // ---- Providers ----
  const providers: Provider[] = [];
  if (cfg.providers.anthropic) {
    providers.push(
      new AnthropicProvider(cfg.env.ANTHROPIC_API_KEY!, { timeoutMs: cfg.env.UPSTREAM_TIMEOUT_MS }),
    );
  }
  if (cfg.providers.openai) {
    providers.push(
      new OpenAIProvider(cfg.env.OPENAI_API_KEY!, { timeoutMs: cfg.env.UPSTREAM_TIMEOUT_MS }),
    );
  }
  if (providers.length === 0) {
    logger.warn('no upstream provider credentials configured — gateway will 502 on /v1/*');
  }
  const registry = new StaticProviderRegistry(providers);

  // ---- DB / Repo ----
  const pool = cfg.hasPostgres ? createPool(cfg.env.DATABASE_URL!) : null;
  const repo = pool ? new Repo(pool) : null;

  // ---- Cache ----
  let cache: Cache;
  if (pool && cfg.env.EMBEDDING_PROVIDER !== 'off') {
    let embedder: ProviderEmbedder | null = null;
    try {
      const embedProvider = registry.available().includes('openai')
        ? (registry as StaticProviderRegistry).byId('openai')
        : null;
      embedder = embedProvider
        ? new ProviderEmbedder(embedProvider, cfg.env.EMBEDDING_MODEL)
        : null;
    } catch (err) {
      logger.warn({ err }, 'failed to construct embedder; semantic cache disabled');
    }
    cache = new PostgresCache({
      pool,
      embedder,
      similarityThreshold: cfg.env.SEMANTIC_CACHE_THRESHOLD,
      ttlSeconds: cfg.env.SEMANTIC_CACHE_TTL_SECONDS,
    });
  } else if (pool) {
    cache = new PostgresCache({
      pool,
      embedder: null,
      similarityThreshold: cfg.env.SEMANTIC_CACHE_THRESHOLD,
      ttlSeconds: cfg.env.SEMANTIC_CACHE_TTL_SECONDS,
    });
  } else {
    cache = new MemoryCache({ ttlSeconds: cfg.env.SEMANTIC_CACHE_TTL_SECONDS });
  }

  // ---- Shadow ----
  const shadowStats = new ShadowStats(cfg.env.SHADOW_WINDOW_SIZE);
  let shadow: ShadowController | null = null;
  if (
    cfg.env.SHADOW_SAMPLE_PERCENT > 0 &&
    Object.keys(cfg.shadowCandidates).length > 0 &&
    providers.length > 0
  ) {
    const judgeProvider = providers.find((p) => p.supports(cfg.env.SHADOW_JUDGE_MODEL));
    if (!judgeProvider) {
      logger.warn(
        `shadow: no provider supports judge model '${cfg.env.SHADOW_JUDGE_MODEL}'; shadow disabled`,
      );
    } else {
      shadow = new ShadowController({
        plan: new StaticShadowPlan(cfg.shadowCandidates, cfg.env.SHADOW_SAMPLE_PERCENT),
        registry,
        judge: new LlmJudge(judgeProvider, cfg.env.SHADOW_JUDGE_MODEL),
        judgeModel: cfg.env.SHADOW_JUDGE_MODEL,
        stats: shadowStats,
        shadowLogger: repo,
      });
      logger.info(
        {
          sample_pct: cfg.env.SHADOW_SAMPLE_PERCENT,
          candidates: cfg.shadowCandidates,
        },
        'shadow eval enabled',
      );
    }
  }

  const app = createApp({
    registry,
    cache,
    shadow,
    shadowStats,
    repo,
    pool,
    staticApiKeys: cfg.apiKeys,
    routingOverrides: cfg.routingOverrides,
    version: '0.1.0',
    rateLimit: {
      capacity: cfg.env.RATE_LIMIT_CAPACITY,
      refillRatePerSec: cfg.env.RATE_LIMIT_REFILL_PER_SEC,
    },
    maxBodyBytes: cfg.env.MAX_BODY_BYTES,
    corsOrigins: cfg.env.CORS_ORIGINS === '*'
      ? '*'
      : cfg.env.CORS_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean),
  });

  const port = cfg.env.PORT;
  serve({ fetch: app.fetch, port }, (info) => {
    logger.info(
      {
        port: info.port,
        providers: registry.available(),
        postgres: !!pool,
        shadow: !!shadow,
        cache: cache instanceof MemoryCache ? 'memory' : 'postgres',
      },
      'keel listening',
    );
  });

  // Graceful shutdown.
  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'shutting down');
    if (pool) await pool.end().catch(() => {});
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
