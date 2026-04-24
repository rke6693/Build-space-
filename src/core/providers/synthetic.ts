import { setTimeout as delay } from 'node:timers/promises';
import { KeelError } from '../../util/errors.js';
import type { CompletionRequest, CompletionResponse } from '../types.js';
import type { Provider } from './base.js';

/**
 * Returns plausible-looking responses without making any real API call.
 * Used by demo mode so a fresh `git clone` can show a live dashboard with
 * believable data — no API keys required.
 *
 * Behaviour:
 *  - Latency varies by model (mimics real-world: bigger model -> slower).
 *  - Output token count scales with input size (capped by maxTokens).
 *  - Errors are injected at a low configurable rate so failure surfaces
 *    in the dashboard naturally.
 *  - Embeddings return deterministic pseudo-vectors keyed off the input
 *    so the semantic cache can actually function in demo mode.
 */
export interface SyntheticProviderOptions {
  errorRate?: number; // 0..1, default 0.005
  baseLatencyMs?: number; // default 250
  random?: () => number;
}

export class SyntheticProvider implements Provider {
  readonly id = 'openai' as const; // pretends to be both — accepts any model
  private readonly errorRate: number;
  private readonly baseLatency: number;
  private readonly rand: () => number;

  constructor(opts: SyntheticProviderOptions = {}) {
    this.errorRate = opts.errorRate ?? 0.005;
    this.baseLatency = opts.baseLatencyMs ?? 250;
    this.rand = opts.random ?? Math.random;
  }

  supports(): boolean {
    return true;
  }

  async complete(req: CompletionRequest): Promise<CompletionResponse> {
    const started = Date.now();

    // Latency model: bigger models are slower. We treat anything containing
    // 'opus' or 'gpt-4.1' as "big," 'sonnet' or 'gpt-4o' as "medium," everything
    // else as "small." Add jitter so the latency histogram has shape.
    const tier =
      /opus|gpt-4\.1\b|o1\b/i.test(req.model)
        ? 'large'
        : /sonnet|gpt-4o\b/i.test(req.model)
          ? 'medium'
          : 'small';
    const tierFactor = tier === 'large' ? 4 : tier === 'medium' ? 1.6 : 1;
    const jitter = 0.6 + this.rand() * 0.8;
    const latency = Math.round(this.baseLatency * tierFactor * jitter);
    await delay(latency);

    if (this.rand() < this.errorRate) {
      throw new KeelError('upstream_error', 'synthetic upstream error', { status: 502 });
    }

    // Token model: input tokens roughly proportional to the request body;
    // output tokens scale with input but capped by maxTokens.
    const inputChars = req.messages.reduce((acc, m) => acc + m.content.length, 0);
    const inputTokens = Math.max(8, Math.ceil(inputChars / 4));
    const outputCap = req.maxTokens ?? 256;
    const outputTokens = Math.min(outputCap, Math.max(16, Math.ceil(inputTokens * 0.6)));

    const lastUserMsg = [...req.messages].reverse().find((m) => m.role === 'user');
    const echo = lastUserMsg?.content.slice(0, 60) ?? '';
    const content = `[demo] ${echo ? `re: "${echo}…" — ` : ''}This is a synthetic response from the Keel demo mode. Disable DEMO_MODE to use real providers.`;

    return {
      id: `synth-${cryptoRandomHex(12)}`,
      model: req.model,
      content,
      finishReason: 'stop',
      usage: { inputTokens, outputTokens },
      latencyMs: Date.now() - started,
    };
  }

  async embed(input: string): Promise<number[]> {
    // Deterministic pseudo-embedding so semantic cache lookups behave the
    // way a real embedder would: similar inputs produce similar vectors.
    // 1536 dims to match text-embedding-3-small.
    const vec = new Array(1536);
    let h = 2166136261; // FNV-1a seed
    for (let i = 0; i < input.length; i++) {
      h ^= input.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    for (let i = 0; i < 1536; i++) {
      h ^= h << 13;
      h ^= h >>> 17;
      h ^= h << 5;
      vec[i] = ((h >>> 0) / 0xffffffff) * 2 - 1; // ~uniform on [-1, 1]
    }
    // L2 normalize so cosine similarity is well-behaved.
    let norm = 0;
    for (const v of vec) norm += v * v;
    norm = Math.sqrt(norm) || 1;
    for (let i = 0; i < 1536; i++) vec[i] /= norm;
    return vec;
  }
}

function cryptoRandomHex(n: number): string {
  const buf = new Uint8Array(n);
  for (let i = 0; i < n; i++) buf[i] = Math.floor(Math.random() * 256);
  return Array.from(buf, (b) => b.toString(16).padStart(2, '0')).join('');
}
