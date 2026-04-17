// Seeded deterministic RNG. PCG32 core + splitmix64 for sub-seed derivation.
// All stochastic calls in the simulator route through here so seed=X reproduces bit-for-bit
// (within the same Rapier WASM build and browser).

export function splitmix64(state) {
  // Returns { next: bigint, state: bigint }. Pure function — no globals.
  let z = (state + 0x9e3779b97f4a7c15n) & 0xffffffffffffffffn;
  z = ((z ^ (z >> 30n)) * 0xbf58476d1ce4e5b9n) & 0xffffffffffffffffn;
  z = ((z ^ (z >> 27n)) * 0x94d049bb133111ebn) & 0xffffffffffffffffn;
  z = z ^ (z >> 31n);
  return { next: z, state: (state + 0x9e3779b97f4a7c15n) & 0xffffffffffffffffn };
}

export function deriveSeed(rootSeed, label) {
  // Derive a sub-seed from a root seed + a string label. Deterministic.
  let h = BigInt(rootSeed) ^ 0xcbf29ce484222325n;
  for (let i = 0; i < label.length; i++) {
    h ^= BigInt(label.charCodeAt(i));
    h = (h * 0x100000001b3n) & 0xffffffffffffffffn;
  }
  const mixed = splitmix64(h).next;
  return Number(mixed & 0xffffffffn);
}

// PCG32: 32-bit output, 64-bit state. Fast and well-distributed.
export class PCG32 {
  constructor(seed = 42) {
    this.state = 0n;
    this.inc = 0xda3e39cb94b95bdbn;
    // Seed via two splitmix steps.
    let s = BigInt(seed >>> 0);
    const a = splitmix64(s); s = a.state;
    this.state = a.next;
    const b = splitmix64(s);
    this.inc = (b.next | 1n) & 0xffffffffffffffffn;
  }

  nextU32() {
    const oldState = this.state;
    this.state = (oldState * 6364136223846793005n + this.inc) & 0xffffffffffffffffn;
    const xorshifted = Number(((oldState >> 18n) ^ oldState) >> 27n & 0xffffffffn);
    const rot = Number(oldState >> 59n) & 31;
    return ((xorshifted >>> rot) | (xorshifted << ((-rot) & 31))) >>> 0;
  }

  // Uniform in [0, 1).
  nextFloat() {
    return this.nextU32() / 4294967296;
  }

  // Uniform in [a, b).
  uniform(a, b) {
    return a + (b - a) * this.nextFloat();
  }

  // Box-Muller Gaussian with mean μ, stddev σ. Cached spare for efficiency.
  normal(mu = 0, sigma = 1) {
    if (this._spare !== undefined) {
      const v = this._spare; this._spare = undefined;
      return mu + sigma * v;
    }
    let u1, u2;
    do { u1 = this.nextFloat(); } while (u1 < 1e-12);
    u2 = this.nextFloat();
    const mag = Math.sqrt(-2 * Math.log(u1));
    const z0 = mag * Math.cos(2 * Math.PI * u2);
    const z1 = mag * Math.sin(2 * Math.PI * u2);
    this._spare = z1;
    return mu + sigma * z0;
  }

  // Shuffle array in place, Fisher-Yates.
  shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this.nextFloat() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }
}
