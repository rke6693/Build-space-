/** Small, dependency-free numeric helpers shared by simulation and renderer. */

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function lerp(from, to, amount) {
  return from + (to - from) * clamp(amount, 0, 1);
}

/** Frame-rate independent approach toward a target. */
export function damp(from, to, rate, dt) {
  return lerp(from, to, 1 - Math.exp(-rate * dt));
}

export function positiveMod(value, divisor) {
  return ((value % divisor) + divisor) % divisor;
}

/** Deterministic hash-noise in [0, 1) — used for stable ambient layouts. */
export function seeded(value) {
  const result = Math.sin(value * 12.9898) * 43758.5453;
  return result - Math.floor(result);
}

export function randomRange(min, max, random = Math.random) {
  return min + random() * (max - min);
}

/**
 * Mulberry32. Small, fast, and repeatable — the simulation uses it so a run
 * can be replayed exactly in a test.
 */
export function createRandom(seed = 1) {
  let state = seed >>> 0;
  return function random() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function formatTime(milliseconds) {
  const safe = Math.max(0, Math.floor(milliseconds / 1000));
  const minutes = Math.floor(safe / 60);
  return `${minutes}:${String(safe % 60).padStart(2, "0")}`;
}

/** Axis-aligned overlap test on centre-x / bottom-y entities. */
export function overlaps(aLeft, aRight, aTop, aBottom, bLeft, bRight, bTop, bBottom) {
  return aRight > bLeft && aLeft < bRight && aBottom > bTop && aTop < bBottom;
}
