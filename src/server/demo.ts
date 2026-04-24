import { setTimeout as delay } from 'node:timers/promises';
import type { Hono } from 'hono';
import { logger } from '../util/logger.js';

/**
 * In-process traffic generator for DEMO_MODE. Continuously hits the gateway
 * with a varied prompt mix so a fresh visitor sees a live dashboard instead
 * of zeros. Stops automatically when the process exits.
 *
 * Realistic mix (rough proportions match what teams actually run):
 *  - 50% high-redundancy queries (good cache candidates)
 *  - 25% novel queries (cache misses)
 *  - 15% near-duplicates of recent queries (semantic cache hits)
 *  - 10% rephrased classics (mix of exact + semantic)
 *
 * Models are weighted toward cheaper ones to mirror typical traffic.
 */
const FAQ_PROMPTS = [
  'What is your refund policy?',
  'How do I reset my password?',
  'Where can I find my API key?',
  'How do I cancel my subscription?',
  'What payment methods do you accept?',
  "I'm having trouble logging in.",
  'How do I export my data?',
  'Is there a free trial?',
  'Do you offer discounts for nonprofits?',
  'How do I add a teammate to my account?',
];

const NOVEL_TEMPLATES = [
  'Summarize the difference between {a} and {b} in three bullets.',
  'Write a 50-word product description for a {a}.',
  'Explain why {a} matters for a {b} engineer.',
  'Generate three headline options for a blog post about {a}.',
  'Rewrite this in a friendlier tone: "{a}".',
  'List five common mistakes when {a}.',
];

const NEAR_DUPLICATES: Array<{ canonical: string; variants: string[] }> = [
  {
    canonical: 'How do I reset my password?',
    variants: [
      "I forgot my password — how do I reset it?",
      'password reset help',
      "Can't remember password — what now?",
    ],
  },
  {
    canonical: 'What is your refund policy?',
    variants: [
      'do you give refunds',
      "I want my money back, what's the policy",
      'refunds available?',
    ],
  },
];

const FILL = [
  'TypeScript',
  'a coffee subscription',
  'shadow-eval routing',
  'pgvector',
  'this Tuesday',
  'a senior engineer',
  'an indie hacker',
  'a part-time founder',
  'an LLM gateway',
  'token-bucket rate limiting',
];

const MODEL_WEIGHTS: Array<[string, number]> = [
  ['gpt-4o-mini', 35],
  ['claude-haiku-4-5', 25],
  ['claude-sonnet-4-6', 18],
  ['gpt-4o', 12],
  ['claude-3-5-sonnet', 7],
  ['gpt-4.1', 3],
];

function pickModel(): string {
  const total = MODEL_WEIGHTS.reduce((a, [, w]) => a + w, 0);
  let r = Math.random() * total;
  for (const [m, w] of MODEL_WEIGHTS) {
    if ((r -= w) <= 0) return m;
  }
  return MODEL_WEIGHTS[0]![0];
}

function pickFaq(): string {
  return FAQ_PROMPTS[Math.floor(Math.random() * FAQ_PROMPTS.length)]!;
}

function pickNovel(): string {
  const t = NOVEL_TEMPLATES[Math.floor(Math.random() * NOVEL_TEMPLATES.length)]!;
  return t
    .replace('{a}', FILL[Math.floor(Math.random() * FILL.length)]!)
    .replace('{b}', FILL[Math.floor(Math.random() * FILL.length)]!);
}

function pickNearDup(): string {
  const group = NEAR_DUPLICATES[Math.floor(Math.random() * NEAR_DUPLICATES.length)]!;
  return group.variants[Math.floor(Math.random() * group.variants.length)]!;
}

function pickPrompt(): string {
  const r = Math.random();
  if (r < 0.5) return pickFaq();
  if (r < 0.75) return pickNovel();
  if (r < 0.9) return pickNearDup();
  return Math.random() < 0.5 ? pickFaq() : pickNearDup();
}

export interface DemoTrafficOptions {
  app: Hono;
  apiKey: string;
  /** Average requests per second. Default 1. */
  rps?: number;
  /** Stop after this many requests. Omit to run indefinitely. */
  maxRequests?: number;
}

export function startDemoTraffic(opts: DemoTrafficOptions): { stop: () => void } {
  const rps = opts.rps ?? 1;
  let running = true;
  let sent = 0;
  const intervalMs = 1000 / rps;

  void (async () => {
    logger.info({ rps }, 'demo: traffic generator started');
    // Small jitter on startup so the first burst doesn't all land in one tick.
    await delay(500);

    while (running) {
      if (opts.maxRequests && sent >= opts.maxRequests) {
        running = false;
        break;
      }
      const prompt = pickPrompt();
      const model = pickModel();
      const body = JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0,
      });
      const headers = {
        authorization: `Bearer ${opts.apiKey}`,
        'content-type': 'application/json',
      };
      try {
        // Hono's app.request hits the in-process router with no real network.
        // This is the cheapest, most reliable way to drive the gateway in
        // demo mode.
        const res = await opts.app.request('/v1/chat/completions', {
          method: 'POST',
          headers,
          body,
        });
        if (!res.ok && res.status !== 429) {
          // 429 is expected when burst exceeds capacity; we just back off naturally.
          logger.debug({ status: res.status }, 'demo: non-2xx response');
        }
      } catch (err) {
        logger.warn({ err }, 'demo: request failed');
      }
      sent++;
      // Jitter: 0.5x to 1.5x of intervalMs so the request rate looks organic.
      const jitter = 0.5 + Math.random();
      await delay(intervalMs * jitter);
    }
    logger.info({ sent }, 'demo: traffic generator stopped');
  })();

  return {
    stop: () => {
      running = false;
    },
  };
}
