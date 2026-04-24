import { describe, expect, it } from 'vitest';
import { MemoryCache } from '../../src/core/cache/memory.js';
import type { Provider, ProviderRegistry } from '../../src/core/providers/base.js';
import { ShadowStats } from '../../src/core/shadow/stats.js';
import type { CompletionRequest, CompletionResponse } from '../../src/core/types.js';
import { createApp } from '../../src/server/app.js';

class MockProvider implements Provider {
  readonly id = 'openai' as const;
  calls = 0;
  delayMs = 0;
  fail: 'never' | 'once' | 'always' = 'never';
  failed = 0;

  supports(): boolean {
    return true;
  }

  async complete(req: CompletionRequest): Promise<CompletionResponse> {
    if (this.fail === 'always' || (this.fail === 'once' && this.failed === 0)) {
      this.failed++;
      throw new Error('mock-upstream-failure');
    }
    if (this.delayMs > 0) {
      await new Promise((r) => setTimeout(r, this.delayMs));
    }
    this.calls++;
    return {
      id: `mock-${this.calls}`,
      model: req.model,
      content: `echo:${req.messages.at(-1)?.content ?? ''}`,
      finishReason: 'stop',
      usage: { inputTokens: 10, outputTokens: 5 },
      latencyMs: 1,
    };
  }
}

class OneProviderRegistry implements ProviderRegistry {
  constructor(readonly provider: MockProvider) {}
  forModel(): Provider {
    return this.provider;
  }
  available(): Array<'anthropic' | 'openai'> {
    return ['openai'];
  }
}

const STATIC_KEY = 'kl_test_integrationkey';
const buildApp = (overrides: Parameters<typeof createApp>[0] extends infer A ? Partial<A> : never = {}) => {
  const provider = new MockProvider();
  const app = createApp({
    registry: new OneProviderRegistry(provider),
    cache: new MemoryCache(),
    shadow: null,
    shadowStats: new ShadowStats(50),
    repo: null,
    pool: null,
    staticApiKeys: [STATIC_KEY],
    routingOverrides: {},
    version: 'test',
    serveLanding: false,
    ...overrides,
  });
  return { app, provider };
};

const callChat = (app: ReturnType<typeof buildApp>['app'], body: unknown, key = STATIC_KEY) =>
  app.request('/v1/chat/completions', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${key}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });

describe('app — auth + routing', () => {
  it('rejects requests without an Authorization header', async () => {
    const { app } = buildApp();
    const res = await app.request('/v1/chat/completions', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'gpt-4o-mini', messages: [{ role: 'user', content: 'hi' }] }),
    });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.type).toBe('auth_missing');
  });

  it('rejects requests with the wrong key', async () => {
    const { app } = buildApp();
    const res = await callChat(app, { model: 'gpt-4o-mini', messages: [{ role: 'user', content: 'hi' }] }, 'wrong-key');
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.type).toBe('auth_invalid');
  });

  it('rejects malformed bodies with 400', async () => {
    const { app } = buildApp();
    const res = await callChat(app, { messages: [] }); // missing model + empty messages
    expect(res.status).toBe(400);
  });

  it('rejects streaming requests with a clear error', async () => {
    const { app } = buildApp();
    const res = await callChat(app, {
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: 'hi' }],
      stream: true,
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.message).toMatch(/stream/i);
  });

  it('serves a chat completion through the gateway', async () => {
    const { app, provider } = buildApp();
    const res = await callChat(app, {
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: 'hello' }],
      temperature: 0,
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.choices[0].message.content).toBe('echo:hello');
    expect(body.keel.cache_status).toBe('miss');
    expect(provider.calls).toBe(1);
  });

  it('returns cached response on identical second call', async () => {
    const { app, provider } = buildApp();
    const req = { model: 'gpt-4o-mini', messages: [{ role: 'user', content: 'twice' }], temperature: 0 };
    await callChat(app, req);
    await new Promise((r) => setImmediate(r)); // let fire-and-forget store finish
    const res2 = await callChat(app, req);
    const body = await res2.json();
    expect(body.keel.cache_status).toBe('exact');
    expect(provider.calls).toBe(1);
  });
});

describe('app — health + metrics', () => {
  it('GET /health is public and returns ok', async () => {
    const { app } = buildApp();
    const res = await app.request('/health');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('ok');
  });

  it('GET /metrics exposes Prometheus text', async () => {
    const { app } = buildApp();
    // Drive at least one request so a counter exists.
    await callChat(app, { model: 'gpt-4o-mini', messages: [{ role: 'user', content: 'm' }], temperature: 0 });
    const res = await app.request('/metrics');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/text\/plain/);
    const body = await res.text();
    expect(body).toContain('keel_requests_total');
    expect(body).toContain('keel_request_latency_ms_bucket');
  });
});

describe('app — size limit', () => {
  it('rejects requests above the declared Content-Length', async () => {
    const { app } = buildApp({ maxBodyBytes: 256 });
    // Build a body whose JSON is comfortably above 256 bytes.
    const big = { model: 'gpt-4o-mini', messages: [{ role: 'user', content: 'x'.repeat(1000) }] };
    const json = JSON.stringify(big);
    const res = await app.request('/v1/chat/completions', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${STATIC_KEY}`,
        'content-type': 'application/json',
        'content-length': String(json.length),
      },
      body: json,
    });
    expect(res.status).toBe(413);
    const body = await res.json();
    expect(body.error.type).toBe('payload_too_large');
  });
});

describe('app — rate limit', () => {
  it('returns 429 once the bucket is empty', async () => {
    const { app } = buildApp({ rateLimit: { capacity: 2, refillRatePerSec: 0.0001 } });
    const req = { model: 'gpt-4o-mini', messages: [{ role: 'user', content: 'r' }] };
    // Use distinct prompts so the cache doesn't short-circuit.
    const r1 = await callChat(app, { ...req, messages: [{ role: 'user', content: 'a' }] });
    const r2 = await callChat(app, { ...req, messages: [{ role: 'user', content: 'b' }] });
    const r3 = await callChat(app, { ...req, messages: [{ role: 'user', content: 'c' }] });
    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
    expect(r3.status).toBe(429);
    const body = await r3.json();
    expect(body.error.type).toBe('rate_limited');
    expect(body.error.details.retry_after_ms).toBeGreaterThan(0);
  });
});

describe('app — anthropic-compatible endpoint', () => {
  it('serves /v1/messages with the Anthropic shape', async () => {
    const { app } = buildApp();
    const res = await app.request('/v1/messages', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${STATIC_KEY}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5',
        max_tokens: 64,
        messages: [{ role: 'user', content: 'ping' }],
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.type).toBe('message');
    expect(body.role).toBe('assistant');
    expect(body.content[0].text).toBe('echo:ping');
    expect(body.usage.input_tokens).toBe(10);
  });
});
