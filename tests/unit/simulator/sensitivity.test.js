// Spearman rank + Latin Hypercube tests.

import { describe, it, expect } from 'vitest';
import { spearman, sensitivityMatrix, latinHypercube } from '../../../public/simulator/src/analysis/sensitivity.js';
import { PCG32 } from '../../../public/simulator/src/analysis/rng.js';

describe('spearman', () => {
  it('perfectly monotonic increasing → ρ = 1', () => {
    const x = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const y = [2, 4, 9, 16, 25, 36, 49, 64, 81, 100]; // non-linear but monotonic
    expect(spearman(x, y)).toBeCloseTo(1.0, 10);
  });
  it('perfectly monotonic decreasing → ρ = -1', () => {
    const x = [1, 2, 3, 4, 5];
    const y = [100, 50, 25, 10, 1];
    expect(spearman(x, y)).toBeCloseTo(-1.0, 10);
  });
  it('independent → |ρ| small', () => {
    const rng = new PCG32(12345);
    const x = [], y = [];
    for (let i = 0; i < 500; i++) { x.push(rng.nextFloat()); y.push(rng.nextFloat()); }
    expect(Math.abs(spearman(x, y))).toBeLessThan(0.15);
  });
  it('handles ties', () => {
    expect(() => spearman([1, 1, 1, 2, 2, 3], [5, 4, 6, 5, 6, 7])).not.toThrow();
  });
});

describe('sensitivityMatrix', () => {
  it('ranks inputs by |ρ| descending per output', () => {
    const inputs = {
      strong:  [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
      weak:    [3, 1, 4, 1, 5, 9, 2, 6, 5, 3],
      inverse: [10, 9, 8, 7, 6, 5, 4, 3, 2, 1],
    };
    const outputs = {
      y: [2, 4, 6, 8, 10, 12, 14, 16, 18, 20],
    };
    const rows = sensitivityMatrix(inputs, outputs);
    // Top row should be the input with the highest |ρ|.
    expect(Math.abs(rows[0].rho)).toBeGreaterThan(0.95);
    expect(['strong', 'inverse']).toContain(rows[0].input);
  });
});

describe('latinHypercube', () => {
  it('returns n rows of p dims, each col stratified', () => {
    const rng = new PCG32(42);
    const n = 20, p = 3;
    const M = latinHypercube(n, p, rng);
    expect(M.length).toBe(n);
    expect(M[0].length).toBe(p);
    // Each dimension: bin counts should be 1 per n bins (stratification).
    for (let d = 0; d < p; d++) {
      const bins = new Array(n).fill(0);
      for (let i = 0; i < n; i++) {
        const u = M[i][d];
        const bin = Math.min(n - 1, Math.floor(u * n));
        bins[bin]++;
      }
      expect(bins.every(c => c === 1)).toBe(true);
    }
  });
});
