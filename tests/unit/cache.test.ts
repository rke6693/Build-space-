import { describe, expect, it } from 'vitest';
import { cacheKey, isCacheable, promptHash } from '../../src/core/cache/cache.js';
import { MemoryCache } from '../../src/core/cache/memory.js';
import type { CompletionRequest, CompletionResponse } from '../../src/core/types.js';

function req(overrides: Partial<CompletionRequest> = {}): CompletionRequest {
  return {
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: 'hello' }],
    temperature: 0,
    ...overrides,
  };
}

function res(content = 'hi'): CompletionResponse {
  return {
    id: 'res_x',
    model: 'gpt-4o-mini',
    content,
    finishReason: 'stop',
    usage: { inputTokens: 5, outputTokens: 3 },
    latencyMs: 1,
  };
}

describe('cache key', () => {
  it('is stable across param key order', () => {
    const a = cacheKey({ ...req(), maxTokens: 100, topP: 0.9 });
    const b = cacheKey({ ...req(), topP: 0.9, maxTokens: 100 });
    expect(a).toBe(b);
  });

  it('differs when the model changes', () => {
    expect(cacheKey(req({ model: 'gpt-4o' }))).not.toBe(cacheKey(req({ model: 'gpt-4o-mini' })));
  });

  it('promptHash differs on content change', () => {
    expect(promptHash(req())).not.toBe(
      promptHash(req({ messages: [{ role: 'user', content: 'different' }] })),
    );
  });
});

describe('isCacheable', () => {
  it('rejects streaming', () => {
    expect(isCacheable(req({ stream: true }))).toBe(false);
  });

  it('rejects high temperature', () => {
    expect(isCacheable(req({ temperature: 0.7 }))).toBe(false);
  });

  it('accepts low temperature + non-streaming', () => {
    expect(isCacheable(req({ temperature: 0.1 }))).toBe(true);
  });
});

describe('MemoryCache', () => {
  it('returns null for miss', async () => {
    const c = new MemoryCache();
    expect(await c.lookup(req())).toBeNull();
  });

  it('returns exact hit after store', async () => {
    const c = new MemoryCache();
    const r = req();
    await c.store(r, res('stored'));
    const hit = await c.lookup(r);
    expect(hit?.status).toBe('exact');
    expect(hit?.response.content).toBe('stored');
  });

  it('does not store non-cacheable requests', async () => {
    const c = new MemoryCache();
    const r = req({ temperature: 0.8 });
    await c.store(r, res());
    expect(c.size()).toBe(0);
  });

  it('respects TTL', async () => {
    const c = new MemoryCache({ ttlSeconds: 0 });
    const r = req();
    await c.store(r, res());
    // zero TTL: every lookup should expire.
    const hit = await c.lookup(r);
    expect(hit).toBeNull();
  });

  it('evicts oldest entry when capacity is hit', async () => {
    const c = new MemoryCache({ maxEntries: 2 });
    await c.store(req({ messages: [{ role: 'user', content: 'A' }] }), res('a'));
    await c.store(req({ messages: [{ role: 'user', content: 'B' }] }), res('b'));
    await c.store(req({ messages: [{ role: 'user', content: 'C' }] }), res('c'));
    expect(c.size()).toBe(2);
    // Oldest ('A') should be gone.
    expect(await c.lookup(req({ messages: [{ role: 'user', content: 'A' }] }))).toBeNull();
    expect(await c.lookup(req({ messages: [{ role: 'user', content: 'B' }] }))).not.toBeNull();
    expect(await c.lookup(req({ messages: [{ role: 'user', content: 'C' }] }))).not.toBeNull();
  });
});
