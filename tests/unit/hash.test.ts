import { describe, expect, it } from 'vitest';
import { safeEqual, sha256Hex, stableStringify } from '../../src/util/hash.js';

describe('sha256Hex', () => {
  it('hashes empty string to the known sha256 of ""', () => {
    expect(sha256Hex('')).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    );
  });

  it('is deterministic', () => {
    expect(sha256Hex('hello')).toBe(sha256Hex('hello'));
  });
});

describe('safeEqual', () => {
  it('is true for equal strings', () => {
    expect(safeEqual('abc', 'abc')).toBe(true);
  });
  it('is false for different lengths', () => {
    expect(safeEqual('abc', 'abcd')).toBe(false);
  });
  it('is false for equal-length but differing strings', () => {
    expect(safeEqual('abc', 'abd')).toBe(false);
  });
});

describe('stableStringify', () => {
  it('sorts object keys', () => {
    expect(stableStringify({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
  });

  it('produces the same output regardless of key order', () => {
    expect(stableStringify({ z: 1, a: [3, 2, 1], m: { y: 2, x: 1 } })).toBe(
      stableStringify({ a: [3, 2, 1], m: { x: 1, y: 2 }, z: 1 }),
    );
  });

  it('preserves array order', () => {
    expect(stableStringify([3, 1, 2])).toBe('[3,1,2]');
  });

  it('omits undefined values', () => {
    expect(stableStringify({ a: 1, b: undefined })).toBe('{"a":1}');
  });

  it('handles nested undefineds', () => {
    expect(stableStringify({ a: { b: undefined, c: 2 } })).toBe('{"a":{"c":2}}');
  });
});
