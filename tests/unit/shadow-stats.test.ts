import { describe, expect, it } from 'vitest';
import { ShadowStats } from '../../src/core/shadow/stats.js';

describe('ShadowStats', () => {
  it('records and aggregates scores', () => {
    const s = new ShadowStats(10);
    s.record('sonnet', 'haiku', 0.9, 0.001);
    s.record('sonnet', 'haiku', 0.8, 0.002);
    const stats = s.get('sonnet', 'haiku');
    expect(stats?.count).toBe(2);
    expect(stats?.mean).toBeCloseTo(0.85, 5);
    expect(stats?.cumulativeCostDeltaUsd).toBeCloseTo(0.003, 6);
  });

  it('keeps only the most recent N scores', () => {
    const s = new ShadowStats(3);
    s.record('a', 'b', 0.1, 0);
    s.record('a', 'b', 0.2, 0);
    s.record('a', 'b', 0.3, 0);
    s.record('a', 'b', 0.4, 0);
    const stats = s.get('a', 'b');
    expect(stats?.count).toBe(3);
    expect(stats?.mean).toBeCloseTo((0.2 + 0.3 + 0.4) / 3, 5);
  });

  it('returns null when nothing recorded', () => {
    const s = new ShadowStats(5);
    expect(s.get('x', 'y')).toBeNull();
  });

  it('qualifyingForPromotion respects threshold and min samples', () => {
    const s = new ShadowStats(100);
    for (let i = 0; i < 20; i++) s.record('sonnet', 'haiku', 0.95, 0.001);
    for (let i = 0; i < 20; i++) s.record('sonnet', 'opus', 0.5, 0.001);
    const qualifying = s.qualifyingForPromotion(0.9, 10);
    expect(qualifying.length).toBe(1);
    expect(qualifying[0]?.candidate).toBe('haiku');
  });

  it('qualifyingForPromotion skips pairs below min samples', () => {
    const s = new ShadowStats(100);
    for (let i = 0; i < 5; i++) s.record('sonnet', 'haiku', 0.99, 0.001);
    expect(s.qualifyingForPromotion(0.9, 10)).toEqual([]);
  });
});
