/**
 * Per-model pricing in USD per 1M tokens.
 *
 * Sources: Anthropic public pricing page and OpenAI public pricing page
 * (both accessed 2026-04). Keep this file small and easy to update — pricing
 * drifts. If a model isn't listed, we fall back to `unknownPrice` which
 * charges nothing and logs a warning, so budgets still work but slightly under.
 */

export interface ModelPrice {
  input: number; // USD per 1M input tokens
  output: number; // USD per 1M output tokens
  /** Optional cached-input price, if the provider offers prompt caching. */
  cachedInput?: number;
}

export const PRICING: Readonly<Record<string, ModelPrice>> = {
  // Anthropic
  'claude-opus-4-7': { input: 15, output: 75, cachedInput: 1.5 },
  'claude-sonnet-4-6': { input: 3, output: 15, cachedInput: 0.3 },
  'claude-haiku-4-5': { input: 0.8, output: 4, cachedInput: 0.08 },
  'claude-3-5-sonnet': { input: 3, output: 15 },
  'claude-3-5-haiku': { input: 0.8, output: 4 },

  // OpenAI (selected)
  'gpt-4o': { input: 2.5, output: 10 },
  'gpt-4o-mini': { input: 0.15, output: 0.6 },
  'gpt-4.1': { input: 3, output: 12 },
  'gpt-4.1-mini': { input: 0.4, output: 1.6 },
  'o1-mini': { input: 3, output: 12 },
  'text-embedding-3-small': { input: 0.02, output: 0 },
  'text-embedding-3-large': { input: 0.13, output: 0 },
};

export const unknownPrice: ModelPrice = { input: 0, output: 0 };

export function priceFor(model: string): ModelPrice {
  return PRICING[model] ?? unknownPrice;
}

export function costUsd(
  model: string,
  inputTokens: number,
  outputTokens: number,
  cachedInputTokens = 0,
): number {
  const p = priceFor(model);
  const regularInput = Math.max(0, inputTokens - cachedInputTokens);
  const usd =
    (regularInput * p.input +
      cachedInputTokens * (p.cachedInput ?? p.input) +
      outputTokens * p.output) /
    1_000_000;
  // Round to microdollars to avoid floating point noise in ledgers.
  return Math.round(usd * 1_000_000) / 1_000_000;
}
