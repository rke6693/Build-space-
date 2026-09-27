import { describe, expect, it } from 'vitest';
import { clamp, erf, finite, fragility, hashUnit, normCdf, sanitizeArray, smoothstep } from '../src/sim/math';
import { Rng } from '../src/sim/rng';
import { Noise } from '../src/sim/noise';

describe('math utilities', () => {
  it('erf matches reference values', () => {
    expect(erf(0)).toBeCloseTo(0, 6);
    expect(erf(0.5)).toBeCloseTo(0.5204999, 5);
    expect(erf(1)).toBeCloseTo(0.8427008, 5);
    expect(erf(-1)).toBeCloseTo(-0.8427008, 5);
    expect(erf(3)).toBeCloseTo(0.9999779, 5);
  });
  it('normal CDF is symmetric and monotonic', () => {
    expect(normCdf(0)).toBeCloseTo(0.5, 6);
    expect(normCdf(1.96)).toBeCloseTo(0.975, 3);
    let prev = 0;
    for (let x = -5; x <= 5; x += 0.25) {
      const v = normCdf(x);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
  });
  it('fragility is 0.5 at the median and monotonic in demand', () => {
    expect(fragility(0.3, 0.3, 0.6)).toBeCloseTo(0.5, 6);
    expect(fragility(0, 0.3, 0.6)).toBe(0);
    expect(fragility(0.1, 0.3, 0.6)).toBeLessThan(fragility(0.2, 0.3, 0.6));
    expect(fragility(NaN, 0.3, 0.6)).toBe(0);
  });
  it('sanitizeArray repairs NaN / Infinity and clamps', () => {
    const a = new Float32Array([1, NaN, Infinity, -5, 3]);
    const n = sanitizeArray(a, 0, 2);
    expect(n).toBe(4);
    expect(Array.from(a)).toEqual([1, 0, 0, 0, 2]); // non-finite values fall back to the lower bound
    expect(finite(NaN, 7)).toBe(7);
  });
  it('clamp and smoothstep behave at the edges', () => {
    expect(clamp(5, 0, 1)).toBe(1);
    expect(smoothstep(0, 1, -1)).toBe(0);
    expect(smoothstep(0, 1, 2)).toBe(1);
    expect(smoothstep(0, 1, 0.5)).toBeCloseTo(0.5, 6);
  });
  it('hashUnit is deterministic and roughly uniform', () => {
    expect(hashUnit(1, 2, 3, 4)).toBe(hashUnit(1, 2, 3, 4));
    expect(hashUnit(1, 2, 3, 4)).not.toBe(hashUnit(1, 2, 3, 5));
    let sum = 0;
    const bins = new Array(10).fill(0);
    for (let k = 0; k < 20000; k++) {
      const u = hashUnit(99, k, 7);
      expect(u).toBeGreaterThanOrEqual(0);
      expect(u).toBeLessThan(1);
      sum += u;
      bins[Math.floor(u * 10)]++;
    }
    expect(sum / 20000).toBeCloseTo(0.5, 1);
    for (const b of bins) expect(b).toBeGreaterThan(1700);
  });
});

describe('seeded RNG', () => {
  it('is reproducible from a seed and differs between seeds', () => {
    const a = new Rng(42);
    const b = new Rng(42);
    const c = new Rng(43);
    const sa = Array.from({ length: 10 }, () => a.next());
    const sb = Array.from({ length: 10 }, () => b.next());
    const sc = Array.from({ length: 10 }, () => c.next());
    expect(sa).toEqual(sb);
    expect(sa).not.toEqual(sc);
  });
  it('state can be snapshotted and restored exactly', () => {
    const r = Rng.stream(7, 'test');
    for (let k = 0; k < 100; k++) r.next();
    const saved = new Uint32Array(r.s);
    const expected = Array.from({ length: 5 }, () => r.next());
    const restored = new Rng(new Uint32Array(saved));
    expect(Array.from({ length: 5 }, () => restored.next())).toEqual(expected);
  });
  it('has sane distribution moments', () => {
    const r = new Rng(1);
    let s = 0;
    let s2 = 0;
    let p = 0;
    const N = 40000;
    for (let k = 0; k < N; k++) {
      const n = r.normal();
      s += n;
      s2 += n * n;
    }
    for (let k = 0; k < 4000; k++) p += r.poisson(3.5);
    expect(s / N).toBeCloseTo(0, 1);
    expect(s2 / N).toBeCloseTo(1, 1);
    expect(p / 4000).toBeCloseTo(3.5, 0);
    expect(r.poisson(0)).toBe(0);
    expect(r.poisson(NaN)).toBe(0);
  });
  it('independent named streams do not collide', () => {
    expect(Rng.stream(5, 'fire').next()).not.toBe(Rng.stream(5, 'quake').next());
  });
});

describe('noise', () => {
  it('is deterministic and bounded', () => {
    const n1 = new Noise(3);
    const n2 = new Noise(3);
    for (let k = 0; k < 500; k++) {
      const x = k * 0.37;
      const y = k * 0.11;
      expect(n1.noise2(x, y)).toBe(n2.noise2(x, y));
      const v = n1.fbm3(x, y, k * 0.01);
      expect(Math.abs(v)).toBeLessThan(1.6);
      const r = n1.ridged2(x, y);
      expect(r).toBeGreaterThanOrEqual(0);
      expect(r).toBeLessThanOrEqual(1);
    }
  });
});
