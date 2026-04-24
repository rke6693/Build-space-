import { describe, expect, it, vi } from 'vitest';
import type { Provider, ProviderRegistry } from '../../src/core/providers/base.js';
import { LlmJudge } from '../../src/core/shadow/judge.js';
import { ShadowController, StaticShadowPlan } from '../../src/core/shadow/shadow.js';
import { ShadowStats } from '../../src/core/shadow/stats.js';
import type { CompletionRequest, CompletionResponse } from '../../src/core/types.js';

function fakeResponse(model: string, content: string, cost = 0): CompletionResponse {
  void cost;
  return {
    id: 'x',
    model,
    content,
    finishReason: 'stop',
    usage: { inputTokens: 10, outputTokens: 5 },
    latencyMs: 5,
  };
}

class FakeRegistry implements ProviderRegistry {
  constructor(private readonly p: Provider) {}
  forModel(): Provider {
    return this.p;
  }
  available(): Array<'anthropic' | 'openai'> {
    return ['openai'];
  }
}

describe('LlmJudge', () => {
  it('parses SCORE: output from provider', async () => {
    const provider: Provider = {
      id: 'openai',
      supports: () => true,
      complete: async () => fakeResponse('judge', 'SCORE: 0.87'),
    };
    const judge = new LlmJudge(provider, 'judge');
    const s = await judge.score(
      { model: 'primary', messages: [{ role: 'user', content: 'hi' }] },
      fakeResponse('primary', 'A'),
      fakeResponse('candidate', 'B'),
    );
    expect(s).toBeCloseTo(0.87);
  });

  it('rejects unparseable output', async () => {
    const provider: Provider = {
      id: 'openai',
      supports: () => true,
      complete: async () => fakeResponse('judge', 'looks good to me'),
    };
    const judge = new LlmJudge(provider, 'judge');
    await expect(
      judge.score(
        { model: 'primary', messages: [{ role: 'user', content: 'hi' }] },
        fakeResponse('primary', 'A'),
        fakeResponse('candidate', 'B'),
      ),
    ).rejects.toThrow(/unparseable/);
  });

  it('rejects out-of-range scores', async () => {
    const provider: Provider = {
      id: 'openai',
      supports: () => true,
      complete: async () => fakeResponse('judge', 'SCORE: 1.5'),
    };
    const judge = new LlmJudge(provider, 'judge');
    await expect(
      judge.score(
        { model: 'primary', messages: [{ role: 'user', content: 'hi' }] },
        fakeResponse('primary', 'A'),
        fakeResponse('candidate', 'B'),
      ),
    ).rejects.toThrow();
  });
});

describe('ShadowController', () => {
  const req: CompletionRequest = {
    model: 'claude-sonnet-4-6',
    messages: [{ role: 'user', content: 'hi' }],
    temperature: 0,
  };
  const primary = fakeResponse('claude-sonnet-4-6', 'answer A');

  it('returns null when request model has no configured candidate', () => {
    const stats = new ShadowStats(10);
    const ctrl = new ShadowController({
      plan: new StaticShadowPlan({}, 100),
      registry: new FakeRegistry({
        id: 'openai',
        supports: () => true,
        complete: async () => primary,
      }),
      judge: { score: async () => 1 },
      judgeModel: 'j',
      stats,
      shadowLogger: null,
      random: () => 0,
    });
    expect(ctrl.maybeShadow({ requestId: 'r', request: req, primary })).toBeNull();
  });

  it('returns null when sample percent excludes the request', () => {
    const stats = new ShadowStats(10);
    const ctrl = new ShadowController({
      plan: new StaticShadowPlan({ 'claude-sonnet-4-6': 'claude-haiku-4-5' }, 10),
      registry: new FakeRegistry({
        id: 'openai',
        supports: () => true,
        complete: async () => primary,
      }),
      judge: { score: async () => 1 },
      judgeModel: 'j',
      stats,
      shadowLogger: null,
      random: () => 0.5, // 50% -- above the 10% threshold
    });
    expect(ctrl.maybeShadow({ requestId: 'r', request: req, primary })).toBeNull();
  });

  it('fires candidate + judge and records stats when sampled', async () => {
    const stats = new ShadowStats(10);
    const provider: Provider = {
      id: 'openai',
      supports: () => true,
      complete: vi.fn(async () => fakeResponse('claude-haiku-4-5', 'answer B')),
    };
    const judge = { score: vi.fn(async () => 0.9) };
    const logged: unknown[] = [];
    const ctrl = new ShadowController({
      plan: new StaticShadowPlan({ 'claude-sonnet-4-6': 'claude-haiku-4-5' }, 100),
      registry: new FakeRegistry(provider),
      judge,
      judgeModel: 'claude-haiku-4-5',
      stats,
      shadowLogger: { logAttempt: async (a) => void logged.push(a) },
      random: () => 0,
    });
    await ctrl.maybeShadow({ requestId: 'r', request: req, primary });
    expect(judge.score).toHaveBeenCalledTimes(1);
    const recorded = stats.get('claude-sonnet-4-6', 'claude-haiku-4-5');
    expect(recorded?.count).toBe(1);
    expect(recorded?.mean).toBeCloseTo(0.9);
    expect(logged).toHaveLength(1);
  });

  it('swallows candidate failures and logs them', async () => {
    const stats = new ShadowStats(10);
    const provider: Provider = {
      id: 'openai',
      supports: () => true,
      complete: async () => {
        throw new Error('boom');
      },
    };
    const logged: unknown[] = [];
    const ctrl = new ShadowController({
      plan: new StaticShadowPlan({ 'claude-sonnet-4-6': 'claude-haiku-4-5' }, 100),
      registry: new FakeRegistry(provider),
      judge: { score: async () => 1 },
      judgeModel: 'j',
      stats,
      shadowLogger: { logAttempt: async (a) => void logged.push(a) },
      random: () => 0,
    });
    // Should NOT throw — shadow is fire-and-forget.
    await ctrl.maybeShadow({ requestId: 'r', request: req, primary });
    expect(logged).toHaveLength(1);
    expect((logged[0] as { candidateOk: boolean }).candidateOk).toBe(false);
  });
});
