import { z } from 'zod';

// Fail fast at boot if required env is missing or malformed.
// Never import this from client components — server-only.
const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  NEXTAUTH_URL: z.string().url(),
  AUTH_SECRET: z.string().min(32),

  DATABASE_URL: z.string().url(),

  RESEND_API_KEY: z.string().min(1).optional(),
  EMAIL_FROM: z.string().min(1).optional(),

  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),

  STRIPE_SECRET_KEY: z.string().min(1),
  STRIPE_WEBHOOK_SECRET: z.string().min(1),
  STRIPE_PRICE_PRO_MONTHLY: z.string().startsWith('price_'),
  STRIPE_PRICE_PRO_YEARLY: z.string().startsWith('price_').optional(),

  UPSTASH_REDIS_REST_URL: z.string().url().optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().optional(),

  RUN_TOKEN_SECRET: z.string().min(32),

  // Daily food-offers email (Vercel Cron).
  // CRON_SECRET is the bearer token Vercel Cron includes on each invocation.
  CRON_SECRET: z.string().min(16).optional(),
  DAILY_OFFERS_RECIPIENT: z.string().email().optional(),
  DAILY_OFFERS_ZIP: z.string().regex(/^\d{5}$/).default('45103'),
  DAILY_OFFERS_TZ: z.string().default('America/New_York'),
  DAILY_OFFERS_SEND_HOUR: z.coerce.number().int().min(0).max(23).default(8),
  YELP_API_KEY: z.string().min(1).optional(),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  // In dev / tests we surface the first missing key to make scaffolding easier.
  const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
  throw new Error(`Invalid environment configuration: ${issues}`);
}

export const env = parsed.data;
