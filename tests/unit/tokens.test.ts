import { describe, expect, it } from 'vitest';
import { estimateMessageTokens, estimateTokens } from '../../src/util/tokens.js';

describe('estimateTokens', () => {
  it('returns 0 for empty string', () => {
    expect(estimateTokens('')).toBe(0);
  });

  it('grows roughly linearly with length', () => {
    const short = estimateTokens('a'.repeat(40));
    const long = estimateTokens('a'.repeat(400));
    expect(long).toBeGreaterThan(short);
    // within 15% of a 10x ratio
    expect(long / short).toBeGreaterThan(8);
    expect(long / short).toBeLessThan(12);
  });

  it('estimates higher density for non-ASCII text', () => {
    const ascii = estimateTokens('a'.repeat(100));
    const nonAscii = estimateTokens('漢'.repeat(100));
    expect(nonAscii).toBeGreaterThan(ascii);
  });
});

describe('estimateMessageTokens', () => {
  it('sums per-message tokens plus overhead', () => {
    const single = estimateMessageTokens([{ role: 'user', content: 'hello world' }]);
    const double = estimateMessageTokens([
      { role: 'user', content: 'hello world' },
      { role: 'assistant', content: 'hi' },
    ]);
    expect(double).toBeGreaterThan(single);
  });
});
