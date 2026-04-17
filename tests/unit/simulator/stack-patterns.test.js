// Stack pattern generator counts — hand-verified against CHEP 48x40 footprint.

import { describe, it, expect } from 'vitest';
import { layoutLayer, estimateLayerCount } from '../../../public/simulator/src/physics/stack-patterns.js';

// Pallet footprint: 1219 × 1016 mm

describe('column stack', () => {
  it('300×250 mm boxes: 4 along length × 4 across width = 16 per layer', () => {
    const layer = layoutLayer('column', 0, { L: 0.300, W: 0.250, H: 0.220 });
    expect(layer.length).toBe(16);
    // All in bounds.
    for (const p of layer) {
      expect(Math.abs(p.x)).toBeLessThanOrEqual(1.219 / 2);
      expect(Math.abs(p.z)).toBeLessThanOrEqual(1.016 / 2);
    }
  });
  it('all rotations are zero', () => {
    const layer = layoutLayer('column', 0, { L: 0.300, W: 0.250, H: 0.220 });
    expect(layer.every(p => p.rotY === 0)).toBe(true);
  });
});

describe('interlock', () => {
  it('alternates between two layouts', () => {
    const a = layoutLayer('interlock', 0, { L: 0.300, W: 0.250, H: 0.220 });
    const b = layoutLayer('interlock', 1, { L: 0.300, W: 0.250, H: 0.220 });
    // They should differ (rotation or offset).
    const differs = a.some((p, i) => {
      const q = b[i];
      return !q || Math.abs(p.rotY - q.rotY) > 1e-6 ||
             Math.abs(p.x - q.x) > 1e-4 || Math.abs(p.z - q.z) > 1e-4;
    });
    expect(differs).toBe(true);
  });
});

describe('estimateLayerCount', () => {
  it('matches column count', () => {
    const n = estimateLayerCount('column', { L: 0.400, W: 0.300, H: 0.200 });
    // 1219/400 = 3; 1016/300 = 3; 3x3=9
    expect(n).toBe(9);
  });
});
