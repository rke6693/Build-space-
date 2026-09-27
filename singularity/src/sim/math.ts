export const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const smoothstep = (e0: number, e1: number, x: number): number => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};
export const saturate = (v: number): number => clamp(v, 0, 1);

/** Replace NaN/Infinity with a fallback. Used at system boundaries to stop NaN propagation. */
export function finite(v: number, fallback = 0): number {
  return Number.isFinite(v) ? v : fallback;
}

/** Sanitise a typed array in place; returns the number of non-finite values repaired. */
export function sanitizeArray(a: Float32Array, lo = -Infinity, hi = Infinity): number {
  let repaired = 0;
  for (let k = 0; k < a.length; k++) {
    const v = a[k];
    if (!(v >= lo && v <= hi)) {
      // catches NaN as well as out-of-range values
      a[k] = Number.isFinite(v) ? clamp(v, lo, hi) : lo > -Infinity ? lo : 0;
      repaired++;
    }
  }
  return repaired;
}

/** Abramowitz–Stegun approximation of erf, max error ~1.5e-7. */
export function erf(x: number): number {
  const s = x < 0 ? -1 : 1;
  const ax = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * ax);
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-ax * ax);
  return s * y;
}

/** Standard normal CDF. */
export function normCdf(x: number): number {
  return 0.5 * (1 + erf(x / Math.SQRT2));
}

/** Lognormal fragility: probability that demand exceeds a capacity with given median and dispersion. */
export function fragility(demand: number, median: number, beta: number): number {
  if (!(demand > 0) || !(median > 0)) return 0;
  return normCdf(Math.log(demand / median) / beta);
}

export function dist2(ax: number, az: number, bx: number, bz: number): number {
  const dx = ax - bx;
  const dz = az - bz;
  return dx * dx + dz * dz;
}

/** Integer hash (xorshift-multiply). Deterministic, platform independent. */
export function hash32(a: number): number {
  a = (a ^ 61) ^ (a >>> 16);
  a = Math.imul(a, 9);
  a ^= a >>> 4;
  a = Math.imul(a, 0x27d4eb2d);
  a ^= a >>> 15;
  return a >>> 0;
}

/** Deterministic uniform [0,1) draw for (seed, a, b, c) without mutating any generator state. */
export function hashUnit(seed: number, a: number, b = 0, c = 0): number {
  let h = hash32(seed ^ 0x9e3779b9);
  h = hash32(h ^ Math.imul(a + 0x632be5ab, 0x85ebca6b));
  h = hash32(h ^ Math.imul(b + 0x1b873593, 0xc2b2ae35));
  h = hash32(h ^ Math.imul(c + 0x5bd1e995, 0x27d4eb2f));
  return h / 4294967296;
}

export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

export function formatTimeOfDay(hours: number): string {
  const h = ((hours % 24) + 24) % 24;
  const hh = Math.floor(h);
  const mm = Math.floor((h - hh) * 60);
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}
