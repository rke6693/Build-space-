// Cp/Cpk closed-form verification. Uses simple synthetic datasets where we can
// compute μ, σ, Cp, Cpk analytically.

import { describe, it, expect } from 'vitest';
import { cpk, meanStd } from '../../../public/simulator/src/analysis/cpk.js';

describe('meanStd', () => {
  it('matches hand-computed values', () => {
    const { mean, sigma } = meanStd([2, 4, 4, 4, 5, 5, 7, 9]);
    expect(mean).toBeCloseTo(5, 10);
    // Sample stddev (n-1) = sqrt(32/7) ≈ 2.1381
    expect(sigma).toBeCloseTo(Math.sqrt(32 / 7), 6);
  });
  it('zero stddev for constant input', () => {
    const { mean, sigma } = meanStd([3, 3, 3, 3]);
    expect(mean).toBe(3);
    expect(sigma).toBe(0);
  });
});

describe('Cpk — two-sided spec', () => {
  it('centered distribution: Cp = Cpk', () => {
    // Generate 401 equally spaced samples [-3, +3] -> stddev ≈ 1.738
    const samples = [];
    for (let i = -200; i <= 200; i++) samples.push(i / 200 * 3);
    const { mean, sigma, cp, cpk: cpkV } = cpk(samples, { lsl: -6, usl: 6 });
    expect(mean).toBeCloseTo(0, 10);
    // 2-sided: Cp = (USL-LSL)/(6σ)
    expect(cp).toBeCloseTo(12 / (6 * sigma), 6);
    expect(cpkV).toBeCloseTo(cp, 6);
  });
  it('off-center distribution: Cpk < Cp', () => {
    const samples = [];
    for (let i = 0; i <= 400; i++) samples.push(1 + (i - 200) / 200 * 3);
    const { cp, cpk: cpkV } = cpk(samples, { lsl: -6, usl: 6 });
    expect(cpkV).toBeLessThan(cp);
    // cpk = min((6-1)/(3σ), (1-(-6))/(3σ)) = 5/(3σ)
  });
});

describe('Cpk — one-sided USL', () => {
  it('centered at 0, USL=3, σ=1 → cpk = 1.0', () => {
    // Manually construct samples with mean=0 and stddev=1 approximately.
    const samples = [];
    // Use a symmetric triplet that yields mean=0, var=1.
    for (let i = 0; i < 1000; i++) samples.push((i % 2) === 0 ? -1 : 1);
    const { cpu, cpk: cpkV } = cpk(samples, { usl: 3 });
    // mean=0, sigma=1 → cpu = (3-0)/(3*1) = 1
    expect(cpu).toBeCloseTo(1.0, 2);
    expect(cpkV).toBeCloseTo(1.0, 2);
  });
});

describe('Empirical defect rate', () => {
  it('counts samples outside spec', () => {
    const samples = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]; // 10 samples
    const { empDefect } = cpk(samples, { usl: 5 });
    // 6, 7, 8, 9 are > 5 -> 4/10 = 0.4
    expect(empDefect).toBeCloseTo(0.4, 10);
  });
});
