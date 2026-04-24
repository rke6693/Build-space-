import { describe, expect, it } from 'vitest';
import { costUsd, priceFor } from '../../src/core/pricing.js';

describe('pricing.costUsd', () => {
  it('computes cost from input/output tokens at published rates', () => {
    // claude-sonnet-4-6: $3/Mtok in, $15/Mtok out
    // 1000 in + 500 out = 0.003 + 0.0075 = 0.0105
    expect(costUsd('claude-sonnet-4-6', 1000, 500)).toBeCloseTo(0.0105, 6);
  });

  it('applies cached input pricing when provided', () => {
    // 900 regular input + 100 cached input + 500 output
    // 900 * 3/M + 100 * 0.3/M + 500 * 15/M = 0.0027 + 0.00003 + 0.0075
    expect(costUsd('claude-sonnet-4-6', 1000, 500, 100)).toBeCloseTo(0.01023, 6);
  });

  it('returns 0 for unknown models (unknownPrice)', () => {
    expect(costUsd('some-future-model', 1000, 500)).toBe(0);
  });

  it('priceFor returns entries for well-known models', () => {
    expect(priceFor('gpt-4o-mini').input).toBeGreaterThan(0);
    expect(priceFor('claude-haiku-4-5').output).toBeGreaterThan(0);
  });

  it('rounds to microdollars', () => {
    // 1 token * $3/M = $0.000003. Should not leak floating point noise.
    const c = costUsd('claude-sonnet-4-6', 1, 0);
    expect(c).toBe(0.000003);
  });
});
