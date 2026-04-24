#!/usr/bin/env tsx
/**
 * In-process load test for the gateway hot path.
 *
 * Boots a real Hono app with a MemoryCache and a synthetic provider that
 * returns instantly, then drives N requests at concurrency C and reports
 * p50/p95/p99 *gateway overhead* (i.e. all our middleware + router + cache
 * + serialization, but excluding any real upstream latency).
 *
 * The README claims "<2ms p95 overhead on cache miss" — this is the script
 * that proves it. Run before any release.
 *
 * Usage:
 *   tsx scripts/loadtest.ts                      # 10k requests, 64 concurrent
 *   tsx scripts/loadtest.ts --n 50000 --c 128    # custom
 *   tsx scripts/loadtest.ts --mode=hit           # cached path only
 *   tsx scripts/loadtest.ts --mode=miss          # cache-bust every request
 */

import { MemoryCache } from '../src/core/cache/memory.js';
import type { Provider, ProviderRegistry } from '../src/core/providers/base.js';
import { ShadowStats } from '../src/core/shadow/stats.js';
import type { CompletionRequest, CompletionResponse } from '../src/core/types.js';
import { createApp } from '../src/server/app.js';

interface Args {
  n: number;
  c: number;
  mode: 'hit' | 'miss' | 'mixed';
}

function parseArgs(): Args {
  const args: Args = { n: 10_000, c: 64, mode: 'mixed' };
  for (const a of process.argv.slice(2)) {
    if (a.startsWith('--n=')) args.n = Number.parseInt(a.slice(4), 10);
    else if (a === '--n') args.n = Number.parseInt(process.argv[process.argv.indexOf(a) + 1] ?? '0', 10);
    else if (a.startsWith('--c=')) args.c = Number.parseInt(a.slice(4), 10);
    else if (a === '--c') args.c = Number.parseInt(process.argv[process.argv.indexOf(a) + 1] ?? '0', 10);
    else if (a.startsWith('--mode=')) args.mode = a.slice(7) as Args['mode'];
  }
  return args;
}

class FakeProvider implements Provider {
  readonly id = 'openai' as const;
  supports(): boolean {
    return true;
  }
  async complete(req: CompletionRequest): Promise<CompletionResponse> {
    return {
      id: 'lt',
      model: req.model,
      content: 'ok',
      finishReason: 'stop',
      usage: { inputTokens: 10, outputTokens: 5 },
      latencyMs: 0,
    };
  }
}

class Reg implements ProviderRegistry {
  private p = new FakeProvider();
  forModel(): Provider {
    return this.p;
  }
  available(): Array<'anthropic' | 'openai'> {
    return ['openai'];
  }
}

function pct(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx]!;
}

async function main(): Promise<void> {
  const { n, c, mode } = parseArgs();
  const app = createApp({
    registry: new Reg(),
    cache: new MemoryCache({ maxEntries: 1_000_000 }),
    shadow: null,
    shadowStats: new ShadowStats(50),
    repo: null,
    pool: null,
    staticApiKeys: ['kl_loadtest'],
    routingOverrides: {},
    version: 'lt',
    serveLanding: false,
    rateLimit: null, // disable rate limiting for the bench itself
  });

  const headers = {
    authorization: 'Bearer kl_loadtest',
    'content-type': 'application/json',
  };

  // Warm-up: 200 hits to let JIT settle and seed the cache for hit-mode.
  for (let i = 0; i < 200; i++) {
    const body = JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: 'warm' }],
      temperature: 0,
    });
    await app.request('/v1/chat/completions', { method: 'POST', headers, body });
  }

  const timings: number[] = new Array(n);
  let i = 0;
  const start = process.hrtime.bigint();

  async function worker(): Promise<void> {
    while (true) {
      const idx = i++;
      if (idx >= n) return;
      const content =
        mode === 'hit'
          ? 'warm'
          : mode === 'miss'
            ? `unique-${idx}`
            : idx % 2 === 0
              ? 'warm'
              : `unique-${idx}`;
      const body = JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content }],
        temperature: 0,
      });
      const t0 = process.hrtime.bigint();
      const res = await app.request('/v1/chat/completions', { method: 'POST', headers, body });
      const t1 = process.hrtime.bigint();
      timings[idx] = Number(t1 - t0) / 1_000; // µs
      if (res.status !== 200) {
        console.error(`request ${idx} status=${res.status}`);
      }
    }
  }

  await Promise.all(Array.from({ length: c }, () => worker()));
  const end = process.hrtime.bigint();
  const wallMs = Number(end - start) / 1_000_000;
  timings.sort((a, b) => a - b);

  const avg = timings.reduce((a, b) => a + b, 0) / timings.length;
  const rps = (n / wallMs) * 1000;

  console.log('--- keel loadtest ---');
  console.log(`mode:       ${mode}`);
  console.log(`requests:   ${n}`);
  console.log(`concurrency:${c}`);
  console.log(`wall time:  ${wallMs.toFixed(0)} ms`);
  console.log(`throughput: ${rps.toFixed(0)} req/s`);
  console.log('');
  console.log('latency (per request, including all middleware):');
  console.log(`  avg:   ${(avg / 1000).toFixed(3)} ms`);
  console.log(`  p50:   ${(pct(timings, 50) / 1000).toFixed(3)} ms`);
  console.log(`  p95:   ${(pct(timings, 95) / 1000).toFixed(3)} ms`);
  console.log(`  p99:   ${(pct(timings, 99) / 1000).toFixed(3)} ms`);
  console.log(`  max:   ${(timings[timings.length - 1]! / 1000).toFixed(3)} ms`);
  console.log('');
  console.log('Reminder: this measures gateway overhead with a synthetic in-');
  console.log('process provider. Real-world latency is dominated by upstream.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
