import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65_535).default(8787),
  LOG_LEVEL: z.string().default('info'),

  KEEL_API_KEYS: z.string().default(''),

  ANTHROPIC_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),

  DATABASE_URL: z.string().optional(),

  EMBEDDING_PROVIDER: z.enum(['openai', 'off']).default('openai'),
  EMBEDDING_MODEL: z.string().default('text-embedding-3-small'),
  SEMANTIC_CACHE_THRESHOLD: z.coerce.number().min(0).max(1).default(0.93),
  SEMANTIC_CACHE_TTL_SECONDS: z.coerce.number().int().min(0).default(86_400),

  SHADOW_SAMPLE_PERCENT: z.coerce.number().min(0).max(100).default(5),
  SHADOW_JUDGE_MODEL: z.string().default('claude-haiku-4-5'),
  SHADOW_PROMOTION_THRESHOLD: z.coerce.number().min(0).max(1).default(0.92),
  SHADOW_WINDOW_SIZE: z.coerce.number().int().min(10).default(200),
  /** Optional JSON map of primary→candidate models for shadow routing. */
  SHADOW_CANDIDATES: z.string().default('{}'),
  /** Optional JSON map of requested→served models (operator overrides). */
  ROUTING_OVERRIDES: z.string().default('{}'),

  DEFAULT_MONTHLY_BUDGET_USD: z.coerce.number().min(0).default(100),
  BUDGET_HARD_BLOCK: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),
});

export type Env = z.infer<typeof envSchema>;

export interface Config {
  env: Env;
  apiKeys: string[];
  shadowCandidates: Record<string, string>;
  routingOverrides: Record<string, string>;
  hasPostgres: boolean;
  providers: {
    anthropic: boolean;
    openai: boolean;
  };
}

export function loadConfig(raw: NodeJS.ProcessEnv = process.env): Config {
  const parsed = envSchema.parse(raw);
  const apiKeys = parsed.KEEL_API_KEYS.split(',')
    .map((k) => k.trim())
    .filter((k) => k.length > 0);

  const shadowCandidates = parseJsonMap(parsed.SHADOW_CANDIDATES, 'SHADOW_CANDIDATES');
  const routingOverrides = parseJsonMap(parsed.ROUTING_OVERRIDES, 'ROUTING_OVERRIDES');

  return {
    env: parsed,
    apiKeys,
    shadowCandidates,
    routingOverrides,
    hasPostgres: !!parsed.DATABASE_URL,
    providers: {
      anthropic: !!parsed.ANTHROPIC_API_KEY,
      openai: !!parsed.OPENAI_API_KEY,
    },
  };
}

function parseJsonMap(s: string, name: string): Record<string, string> {
  if (!s.trim()) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(s);
  } catch (err) {
    throw new Error(`${name} is not valid JSON: ${(err as Error).message}`);
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`${name} must be a JSON object`);
  }
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
    if (typeof v !== 'string') throw new Error(`${name}.${k} must be a string`);
    out[k] = v;
  }
  return out;
}
