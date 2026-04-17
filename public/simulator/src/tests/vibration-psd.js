// ISTA 3E PSD -> deterministic time-domain acceleration, integrated to displacement,
// applied as kinematic base motion to the pallet.
//
// Synthesis: random-phase spectrum (Hermitian-symmetric) with magnitudes drawn from
// sqrt(PSD(f) * df), then inverse FFT. Variance of the resulting time series equals
// the integral of the input PSD (Parseval), which is the defining property of a
// PSD-shaped random process.
//
// Double integration to displacement uses a 4th-order Butterworth high-pass at 0.5 Hz
// implemented via two biquad stages to remove integration drift (DC + 1/ω^2 noise).

import { PCG32 } from '../analysis/rng.js';
import { ISTA_3E_PSD as ista3eSpec } from '../data/ista3e-psd.js';

export const G = 9.80665;

/** Build a log-log interpolator for a PSD breakpoint table. */
export function buildPSDInterpolator(breakpoints) {
  const pts = [...breakpoints].sort((a, b) => a.f - b.f);
  const logF = pts.map(p => Math.log(p.f));
  const logPSD = pts.map(p => Math.log(Math.max(1e-30, p.psd)));
  return function psd(f) {
    if (f <= pts[0].f) return pts[0].psd;
    if (f >= pts[pts.length - 1].f) return pts[pts.length - 1].psd;
    // Binary search
    let lo = 0, hi = pts.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (pts[mid].f <= f) lo = mid; else hi = mid;
    }
    const lf = Math.log(f);
    const t = (lf - logF[lo]) / (logF[hi] - logF[lo]);
    return Math.exp(logPSD[lo] + t * (logPSD[hi] - logPSD[lo]));
  };
}

export function getISTA3ESpec() { return ista3eSpec; }

/** Integrate a PSD breakpoint table (log-log trapezoid) to get nominal variance (g^2). */
export function integratePSD(breakpoints) {
  const pts = [...breakpoints].sort((a, b) => a.f - b.f);
  let acc = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const f1 = pts[i].f, f2 = pts[i + 1].f;
    const p1 = pts[i].psd, p2 = pts[i + 1].psd;
    // Log-log trapezoid: power-law segment integrates analytically.
    const m = Math.log(p2 / p1) / Math.log(f2 / f1);
    if (Math.abs(m + 1) < 1e-6) {
      acc += p1 * f1 * Math.log(f2 / f1);
    } else {
      acc += (p1 / Math.pow(f1, m)) * (Math.pow(f2, m + 1) - Math.pow(f1, m + 1)) / (m + 1);
    }
  }
  return acc;
}

/* ============================== Radix-2 IFFT ============================== */

function nextPow2(n) {
  let p = 1;
  while (p < n) p <<= 1;
  return p;
}

// In-place Cooley-Tukey FFT. dir = +1 for inverse (no normalization here).
// Operates on separate real/imag Float64Arrays of length N (N power of 2).
function fftInPlace(re, im, dir) {
  const N = re.length;
  // Bit-reversal permutation
  for (let i = 1, j = 0; i < N; i++) {
    let bit = N >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      let tr = re[i]; re[i] = re[j]; re[j] = tr;
      let ti = im[i]; im[i] = im[j]; im[j] = ti;
    }
  }
  for (let len = 2; len <= N; len <<= 1) {
    const ang = dir * 2 * Math.PI / len;
    const wlr = Math.cos(ang);
    const wli = Math.sin(ang);
    for (let i = 0; i < N; i += len) {
      let wr = 1, wi = 0;
      for (let k = 0; k < len / 2; k++) {
        const uRe = re[i + k], uIm = im[i + k];
        const vRe = re[i + k + len / 2] * wr - im[i + k + len / 2] * wi;
        const vIm = re[i + k + len / 2] * wi + im[i + k + len / 2] * wr;
        re[i + k] = uRe + vRe;
        im[i + k] = uIm + vIm;
        re[i + k + len / 2] = uRe - vRe;
        im[i + k + len / 2] = uIm - vIm;
        const nr = wr * wlr - wi * wli;
        wi = wr * wli + wi * wlr;
        wr = nr;
      }
    }
  }
}

/**
 * Synthesize a time-domain acceleration series from a PSD.
 * @returns {{ accel_g: Float64Array, fs: number, df: number, durationSec: number, grmsEmpirical: number }}
 */
export function synthesizeAccelFromPSD({
  breakpoints,
  durationSec,
  fs = 480,
  seed = 42,
  windowHanning = false, // typically off; ISTA 3E random vibration is stationary
} = {}) {
  const N = nextPow2(Math.round(durationSec * fs));
  const df = fs / N;
  const psd = buildPSDInterpolator(breakpoints);
  const re = new Float64Array(N);
  const im = new Float64Array(N);
  const rng = new PCG32(seed);

  // Build Hermitian spectrum. For a discrete real signal x[n] with DFT X[k],
  // variance σ² = (1/N²) Σ|X[k]|² = Σ S(f_k)·df  (Parseval) which gives
  //     |X[k]|² = S(f_k) · N² · df / 2   (k in 1..N/2-1; factor of 2 for two-sided)
  // Hence |X[k]| = N · sqrt(S(f_k)·df / 2).  The ·N factor is the crucial
  // piece that is missing from naive formulations and gives ~√N-too-small Grms.
  for (let k = 1; k < N / 2; k++) {
    const f = k * df;
    const amp = N * Math.sqrt(psd(f) * df / 2);
    const phase = 2 * Math.PI * rng.nextFloat();
    re[k] = amp * Math.cos(phase);
    im[k] = amp * Math.sin(phase);
    re[N - k] = re[k];
    im[N - k] = -im[k];
  }
  re[0] = 0; im[0] = 0;
  // Nyquist bin is its own conjugate so it must be real. Its PSD contribution
  // (at a single bin, unfolded) is |X[N/2]|² = S(f_N/2) · N² · df.
  const nyqAmp = N * Math.sqrt(psd((N / 2) * df) * df);
  re[N / 2] = nyqAmp * (rng.nextFloat() < 0.5 ? 1 : -1);
  im[N / 2] = 0;

  // Inverse FFT: we do forward FFT with dir=+1 and then normalize by N.
  fftInPlace(re, im, +1);
  const accel_g = new Float64Array(N);
  for (let n = 0; n < N; n++) accel_g[n] = re[n] / N;

  // Optional Hann window (NOT used by default — breaks stationarity expectation).
  if (windowHanning) {
    for (let n = 0; n < N; n++) {
      const w = 0.5 - 0.5 * Math.cos(2 * Math.PI * n / (N - 1));
      accel_g[n] *= w;
    }
  }

  let sumSq = 0;
  for (let n = 0; n < N; n++) sumSq += accel_g[n] * accel_g[n];
  const grmsEmpirical = Math.sqrt(sumSq / N);

  return { accel_g, fs, df, durationSec: N / fs, grmsEmpirical };
}

/* ============================ Butterworth HP =============================== */

// 4th-order Butterworth high-pass built from two biquad sections. Zero-phase
// filtfilt (forward + reverse) to avoid group-delay artifacts on the displacement.
function butterworthHP2Coeffs(fc, fs) {
  // Single biquad HP coefficients (RBJ-style with Q=1/sqrt(2))
  const w0 = 2 * Math.PI * fc / fs;
  const cosw = Math.cos(w0), sinw = Math.sin(w0);
  const Q = 1 / Math.SQRT2;
  const alpha = sinw / (2 * Q);
  const b0 = (1 + cosw) / 2;
  const b1 = -(1 + cosw);
  const b2 = (1 + cosw) / 2;
  const a0 = 1 + alpha;
  const a1 = -2 * cosw;
  const a2 = 1 - alpha;
  return { b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: a1 / a0, a2: a2 / a0 };
}

function biquadForward(x, c) {
  const y = new Float64Array(x.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const xi = x[i];
    const yi = c.b0 * xi + c.b1 * x1 + c.b2 * x2 - c.a1 * y1 - c.a2 * y2;
    y[i] = yi; x2 = x1; x1 = xi; y2 = y1; y1 = yi;
  }
  return y;
}

function reverseInPlace(a) {
  for (let i = 0, j = a.length - 1; i < j; i++, j--) {
    const t = a[i]; a[i] = a[j]; a[j] = t;
  }
  return a;
}

export function filtfiltHP(signal, fcHz, fs) {
  const c = butterworthHP2Coeffs(fcHz, fs);
  // Two biquad sections in cascade (4th order), zero-phase.
  let y = biquadForward(signal, c);
  y = biquadForward(y, c);
  reverseInPlace(y);
  y = biquadForward(y, c);
  y = biquadForward(y, c);
  reverseInPlace(y);
  return y;
}

/** Integrate acceleration [g] -> velocity [m/s] via trapezoid + HP filter. */
export function integrateToVelocity(accel_g, fs, hpFc = 0.5) {
  const N = accel_g.length;
  const vel = new Float64Array(N);
  const dt = 1 / fs;
  let acc = 0;
  for (let n = 1; n < N; n++) {
    acc += 0.5 * (accel_g[n] + accel_g[n - 1]) * G * dt;
    vel[n] = acc;
  }
  return filtfiltHP(vel, hpFc, fs);
}

/** Integrate velocity [m/s] -> displacement [m] via trapezoid + HP filter. */
export function integrateToDisplacement(vel_mps, fs, hpFc = 0.5) {
  const N = vel_mps.length;
  const disp = new Float64Array(N);
  const dt = 1 / fs;
  let acc = 0;
  for (let n = 1; n < N; n++) {
    acc += 0.5 * (vel_mps[n] + vel_mps[n - 1]) * dt;
    disp[n] = acc;
  }
  return filtfiltHP(disp, hpFc, fs);
}

/**
 * Full pipeline: PSD + seed + duration -> vertical displacement (m) at sample rate fs.
 */
export function buildISTA3EVerticalDisplacement({
  breakpoints = ista3eSpec.breakpoints,
  durationSec,
  fs = 480,
  seed = 42,
  hpFc = 0.5,
} = {}) {
  const { accel_g, grmsEmpirical } = synthesizeAccelFromPSD({ breakpoints, durationSec, fs, seed });
  const vel = integrateToVelocity(accel_g, fs, hpFc);
  const disp = integrateToDisplacement(vel, fs, hpFc);
  return { accel_g, vel_mps: vel, disp_m: disp, fs, durationSec, grmsEmpirical };
}

/** Kinematic driver that applies the precomputed displacement to a pallet body. */
export class VibrationDriver {
  /**
   * @param {object} opts
   * @param {import('@dimforge/rapier3d-compat').RigidBody} opts.body  Kinematic pallet body.
   * @param {Float64Array} opts.displacement_m    Vertical displacement samples (m).
   * @param {number} opts.fs                      Sample rate (Hz) of displacement buffer.
   * @param {number} opts.baseY                   Equilibrium pallet body Y (m).
   * @param {number} opts.timeCompression         Real-time compression factor (>=1).
   */
  constructor({ body, displacement_m, fs, baseY, timeCompression = 1 }) {
    this.body = body;
    this.disp = displacement_m;
    this.fs = fs;
    this.baseY = baseY;
    this.timeCompression = Math.max(1, timeCompression);
    this.active = false;
    this.elapsed = 0;
  }

  start() { this.active = true; this.elapsed = 0; }
  stop()  { this.active = false; }
  done()  { return this.elapsed >= (this.disp.length - 1) / this.fs; }

  // Call every fixed physics step; dt in seconds.
  step(dt) {
    if (!this.active) return;
    // Advance elapsed at compressed rate: 1 s wall covers timeCompression s of the profile.
    this.elapsed += dt * this.timeCompression;
    if (this.elapsed >= (this.disp.length - 1) / this.fs) { this.stop(); return; }
    const idx = this.elapsed * this.fs;
    const i0 = Math.floor(idx);
    const i1 = Math.min(i0 + 1, this.disp.length - 1);
    const a = idx - i0;
    const y = (1 - a) * this.disp[i0] + a * this.disp[i1];
    // Drive body vertically around its base Y.
    this.body.setNextKinematicTranslation({
      x: this.body.translation().x,
      y: this.baseY + y,
      z: this.body.translation().z,
    });
  }
}
