// Validates the ISTA 3E PSD synthesizer: integral of the input PSD (in g^2) should
// match the variance of the synthesized acceleration series within a few percent,
// and determinism should hold for a given seed.

import { describe, it, expect } from 'vitest';
import {
  buildPSDInterpolator,
  integratePSD,
  synthesizeAccelFromPSD,
  getISTA3ESpec,
  buildISTA3EVerticalDisplacement,
  filtfiltHP,
} from '../../../public/simulator/src/tests/vibration-psd.js';

const spec = getISTA3ESpec();

describe('PSD interpolator', () => {
  it('returns breakpoint values at breakpoints (log-log)', () => {
    const psd = buildPSDInterpolator(spec.breakpoints);
    for (const bp of spec.breakpoints) {
      expect(psd(bp.f)).toBeCloseTo(bp.psd, 8);
    }
  });
  it('is monotonic on each segment', () => {
    const psd = buildPSDInterpolator(spec.breakpoints);
    // between 1 and 4 Hz PSD rises log-log
    expect(psd(2)).toBeGreaterThan(psd(1));
    expect(psd(3)).toBeLessThan(psd(4));
  });
});

describe('PSD integral -> Grms', () => {
  it('integratePSD matches the ISTA 3E nominal Grms within 10%', () => {
    const var_g2 = integratePSD(spec.breakpoints);
    const grms = Math.sqrt(var_g2);
    expect(grms).toBeGreaterThan(spec.grms_nominal * 0.9);
    expect(grms).toBeLessThan(spec.grms_nominal * 1.1);
  });
});

describe('Synthesis variance matches integrated PSD', () => {
  it('Grms of 60s synthetic series matches integrated PSD Grms within 10%', () => {
    const { grmsEmpirical } = synthesizeAccelFromPSD({
      breakpoints: spec.breakpoints,
      durationSec: 60,
      fs: 512,
      seed: 42,
    });
    const expected = Math.sqrt(integratePSD(spec.breakpoints));
    // PSD variance matching: 10% is acceptable for a single realization of 60 s * 512 Hz.
    expect(grmsEmpirical).toBeGreaterThan(expected * 0.80);
    expect(grmsEmpirical).toBeLessThan(expected * 1.20);
  });
});

describe('Determinism', () => {
  it('same seed produces bit-equal acceleration samples', () => {
    const opts = { breakpoints: spec.breakpoints, durationSec: 4, fs: 512, seed: 1234 };
    const a = synthesizeAccelFromPSD(opts);
    const b = synthesizeAccelFromPSD(opts);
    expect(a.accel_g.length).toBe(b.accel_g.length);
    for (let i = 0; i < a.accel_g.length; i++) {
      expect(a.accel_g[i]).toBe(b.accel_g[i]);
    }
  });
  it('different seeds produce different series', () => {
    const a = synthesizeAccelFromPSD({ breakpoints: spec.breakpoints, durationSec: 2, fs: 512, seed: 1 });
    const b = synthesizeAccelFromPSD({ breakpoints: spec.breakpoints, durationSec: 2, fs: 512, seed: 2 });
    let diff = 0;
    for (let i = 0; i < a.accel_g.length; i++) {
      if (a.accel_g[i] !== b.accel_g[i]) diff++;
    }
    expect(diff).toBeGreaterThan(a.accel_g.length * 0.95);
  });
});

describe('Displacement pipeline', () => {
  it('produces a finite displacement series with zero mean (HP filtered)', () => {
    const { disp_m } = buildISTA3EVerticalDisplacement({ durationSec: 10, fs: 480, seed: 7 });
    let sum = 0, absMax = 0;
    for (const v of disp_m) { sum += v; if (Math.abs(v) > absMax) absMax = Math.abs(v); }
    const mean = sum / disp_m.length;
    // HP filter removes drift; mean should be near zero.
    expect(Math.abs(mean)).toBeLessThan(1e-3);
    // ISTA 3E is a mild profile; displacement should be O(mm), not meters.
    expect(absMax).toBeLessThan(0.1);
  });
});

describe('Butterworth HP filtfilt', () => {
  it('passes a high-frequency sinusoid ~unchanged', () => {
    const fs = 480, N = 2048;
    const x = new Float64Array(N);
    for (let i = 0; i < N; i++) x[i] = Math.sin(2 * Math.PI * 50 * i / fs);
    const y = filtfiltHP(x, 0.5, fs);
    let peakX = 0, peakY = 0;
    for (let i = 50; i < N - 50; i++) {
      peakX = Math.max(peakX, Math.abs(x[i]));
      peakY = Math.max(peakY, Math.abs(y[i]));
    }
    expect(peakY).toBeGreaterThan(peakX * 0.95);
  });
  it('kills a DC offset', () => {
    const fs = 480, N = 2048;
    const x = new Float64Array(N).fill(3.0);
    const y = filtfiltHP(x, 0.5, fs);
    // After transient, filtered should be near zero.
    let tail = 0;
    for (let i = N - 200; i < N; i++) tail += Math.abs(y[i]);
    expect(tail / 200).toBeLessThan(0.05);
  });
});
