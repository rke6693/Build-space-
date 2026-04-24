#!/usr/bin/env tsx
/**
 * Micro-benchmark: measures overhead added by Keel's gateway when hitting the
 * MemoryCache path (no real provider call). Useful for regression-testing the
 * hot path. Runs N requests through the router with a mocked provider that
 * resolves instantly, and reports p50/p95/p99 overhead.
 */
import { MemoryCache } from '../src/core/cache/memory.js';
import type { Provider, ProviderRegistry } from '../src/core/providers/base.js';
import { Router } from '../src/core/router.js';
import type { CompletionRequest, CompletionResponse } from '../src/core/types.js';

class FakeProvider implements Provider {
  readonly id = 'openai' as const;
  supports(): boolean {
    return true;
  }
  async complete(req: CompletionRequest): Promise<CompletionResponse> {
    return {
      id: 'bench',
      model: req.model,
      content: 'ok',
      finishReason: 'stop',
      usage: { inputTokens: 10, outputTokens: 5 },
      latencyMs: 0,
    };
  }
}

class OneProviderRegistry implements ProviderRegistry {
  private readonly p = new FakeProvider();
  forModel(): Provider {
    return this.p;
  }
  available(): Array<'anthropic' | 'openai'> {
    return ['openai'];
  }
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx]!;
}

async function main(): Promise<void> {
  const router = new Router({
    registry: new OneProviderRegistry(),
    cache: new MemoryCache(),
    shadow: null,
    overrides: {},
  });

  const iterations = Number.parseInt(process.argv[2] ?? '5000', 10);
  const req: CompletionRequest = {
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: 'hello' }],
    temperature: 0,
  };

  // Warm up + seed the cache.
  for (let i = 0; i < 100; i++) {
    await router.route(req, { apiKeyId: 'bench', endpoint: 'chat.completions' });
  }

  const timings: number[] = [];
  for (let i = 0; i < iterations; i++) {
    const t0 = process.hrtime.bigint();
    await router.route(req, { apiKeyId: 'bench', endpoint: 'chat.completions' });
    const t1 = process.hrtime.bigint();
    timings.push(Number(t1 - t0) / 1_000); // µs
  }
  timings.sort((a, b) => a - b);
  const avg = timings.reduce((a, b) => a + b, 0) / timings.length;
  console.log(`iterations: ${iterations}`);
  console.log(`avg:   ${avg.toFixed(1)} µs`);
  console.log(`p50:   ${percentile(timings, 50).toFixed(1)} µs`);
  console.log(`p95:   ${percentile(timings, 95).toFixed(1)} µs`);
  console.log(`p99:   ${percentile(timings, 99).toFixed(1)} µs`);
  console.log(`max:   ${timings[timings.length - 1]!.toFixed(1)} µs`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
