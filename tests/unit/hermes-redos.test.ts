import { describe, expect, it } from 'vitest';
import { classify } from '@/lib/hermes/intent';

// The classifier runs regexes over speech the device transcribed. Zod caps a
// transcript at 2000 characters; these cases confirm the worst shapes we can
// build inside that cap still finish in microseconds, so the patterns cannot be
// used to stall a request.
describe('classifier is not vulnerable to pathological input', () => {
  const cases: [string, string][] = [
    ['repeated "to"', `add ${'a to '.repeat(390)}b`],
    ['whitespace flood', `remind me to ${' '.repeat(1900)}x`],
    ['nested wrappers', `${'remind me to '.repeat(150)}call mom`],
    ['half-matched time words', `in ${'an hour and a '.repeat(130)}`],
    ['punctuation soup', '?!.'.repeat(600)],
  ];

  for (const [name, input] of cases) {
    it(`handles ${name} in bounded time`, () => {
      const started = performance.now();
      expect(() => classify(input.slice(0, 2000))).not.toThrow();
      expect(performance.now() - started).toBeLessThan(50);
    });
  }
});
