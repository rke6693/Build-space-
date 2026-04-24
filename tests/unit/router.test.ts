import { describe, expect, it, vi } from 'vitest';
import { MemoryCache } from '../../src/core/cache/memory.js';
import type { Provider, ProviderRegistry } from '../../src/core/providers/base.js';
import { Router } from '../../src/core/router.js';
import type { CompletionRequest, CompletionResponse, RoutingContext } from '../../src/core/types.js';

class FakeProvider implements Provider {
  readonly id = 'openai' as const;
  calls: CompletionRequest[] = [];
  constructor(private readonly content = 'hello') {}
  supports(): boolean {
    return true;
  }
  async complete(req: CompletionRequest): Promise<CompletionResponse> {
    this.calls.push(req);
    return {
      id: `call-${this.calls.length}`,
      model: req.model,
      content: this.content,
      finishReason: 'stop',
      usage: { inputTokens: 10, outputTokens: 5 },
      latencyMs: 42,
    };
  }
}

class Registry implements ProviderRegistry {
  constructor(private readonly p: Provider) {}
  forModel(): Provider {
    return this.p;
  }
  available(): Array<'anthropic' | 'openai'> {
    return ['openai'];
  }
}

const ctx = (): RoutingContext => ({
  apiKeyId: 'test',
  endpoint: 'chat.completions',
});

describe('Router', () => {
  it('hits the provider on a cache miss and stores the response', async () => {
    const provider = new FakeProvider();
    const cache = new MemoryCache();
    const router = new Router({
      registry: new Registry(provider),
      cache,
      shadow: null,
      overrides: {},
    });
    const req: CompletionRequest = {
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: 'hi' }],
      temperature: 0,
    };
    const { response, ctx: resolved } = await router.route(req, ctx());
    expect(provider.calls).toHaveLength(1);
    expect(response.content).toBe('hello');
    expect(resolved.cacheStatus).toBe('miss');
    // Give the fire-and-forget store a tick.
    await new Promise((r) => setImmediate(r));
    expect(cache.size()).toBe(1);
  });

  it('serves from cache on second identical call', async () => {
    const provider = new FakeProvider();
    const cache = new MemoryCache();
    const router = new Router({
      registry: new Registry(provider),
      cache,
      shadow: null,
      overrides: {},
    });
    const req: CompletionRequest = {
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: 'hi' }],
      temperature: 0,
    };
    await router.route(req, ctx());
    await new Promise((r) => setImmediate(r));
    const { response, ctx: resolved } = await router.route(req, ctx());
    expect(provider.calls).toHaveLength(1); // only the first call went upstream
    expect(resolved.cacheStatus).toBe('exact');
    expect(resolved.routingRule).toBe('exact-cache');
    expect(response.content).toBe('hello');
  });

  it('applies routing overrides and reports them', async () => {
    const provider = new FakeProvider();
    const router = new Router({
      registry: new Registry(provider),
      cache: new MemoryCache(),
      shadow: null,
      overrides: { 'claude-opus-4-7': 'claude-sonnet-4-6' },
    });
    const req: CompletionRequest = {
      model: 'claude-opus-4-7',
      messages: [{ role: 'user', content: 'hi' }],
      temperature: 0,
    };
    const { response, ctx: resolved } = await router.route(req, ctx());
    expect(provider.calls[0]?.model).toBe('claude-sonnet-4-6');
    expect(response.model).toBe('claude-sonnet-4-6');
    expect(resolved.routingRule).toBe('override');
    expect(resolved.routingReason).toContain('override');
  });

  it('invokes shadow.maybeShadow only on cache miss', async () => {
    const provider = new FakeProvider();
    const shadow = { maybeShadow: vi.fn(() => null) } as any;
    const cache = new MemoryCache();
    const router = new Router({
      registry: new Registry(provider),
      cache,
      shadow,
      overrides: {},
    });
    const req: CompletionRequest = {
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: 'hi' }],
      temperature: 0,
    };
    const first = await router.route(req, ctx());
    first.afterCommit('req-1');
    expect(shadow.maybeShadow).toHaveBeenCalledTimes(1);

    await new Promise((r) => setImmediate(r));
    const second = await router.route(req, ctx());
    second.afterCommit('req-2');
    // cached path has a no-op afterCommit
    expect(shadow.maybeShadow).toHaveBeenCalledTimes(1);
  });
});
