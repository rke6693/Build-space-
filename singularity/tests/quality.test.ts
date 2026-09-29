import { describe, expect, it } from 'vitest';
import { AdaptiveQuality, type QualityLevel, qualitySettings } from '../src/render/quality';

/** Feeds `seconds` of frames with the given interval pattern and returns the resulting level. */
function run(start: QualityLevel, intervals: (i: number) => number, seconds = 20): QualityLevel {
  let level = start;
  const aq = new AdaptiveQuality(start, (l) => (level = l));
  let now = 0;
  for (let i = 0; now < seconds * 1000; i++) {
    const dt = intervals(i);
    now += dt;
    aq.frame(dt, now);
  }
  return level;
}

describe('adaptive quality', () => {
  it('steps down when frames are genuinely slow', () => {
    expect(run('high', () => 45)).not.toBe('high');
  });

  it('does not mistake a steady 30 fps display cap (iOS Low Power Mode) for overload', () => {
    expect(run('high', (i) => 33.3 + (i % 3 === 0 ? 0.6 : -0.3))).toBe('high');
  });

  it('still steps down under a cap when frames drop well below it', () => {
    expect(run('high', () => 50)).not.toBe('high');
  });

  it('climbs back to high when there is headroom', () => {
    expect(run('low', () => 16.6, 60)).toBe('high');
  });

  it('phone preset renders below native resolution with shadows and post', () => {
    const q = qualitySettings('medium', 3);
    expect(q.pixelRatio).toBeLessThanOrEqual(1.25);
    expect(q.post).toBe(true);
  });
});
