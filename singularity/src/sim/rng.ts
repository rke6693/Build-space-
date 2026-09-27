/**
 * Small-fast-counter (sfc32) PRNG. The full state is a Uint32Array(4) so it can be
 * snapshotted with the rest of the simulation state and restored bit-exactly.
 */
export class Rng {
  readonly s: Uint32Array;

  constructor(seedOrState: number | Uint32Array) {
    if (typeof seedOrState === 'number') {
      this.s = new Uint32Array(4);
      const seeds = cyrb128(String(seedOrState >>> 0) + ':sfc32');
      this.s.set(seeds);
      for (let k = 0; k < 16; k++) this.nextU32();
    } else {
      this.s = seedOrState;
    }
  }

  static fromString(label: string): Rng {
    const r = new Rng(0);
    r.s.set(cyrb128(label));
    for (let k = 0; k < 16; k++) r.nextU32();
    return r;
  }

  /** Derive an independent stream for a subsystem, e.g. rng.fork('fire'). */
  static stream(seed: number, label: string): Rng {
    return Rng.fromString(`${seed >>> 0}/${label}`);
  }

  nextU32(): number {
    const s = this.s;
    let a = s[0], b = s[1], c = s[2], d = s[3];
    const t = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) | 0;
    s[0] = a; s[1] = b; s[2] = c; s[3] = d;
    return t >>> 0;
  }

  /** Uniform in [0, 1). */
  next(): number {
    return this.nextU32() / 4294967296;
  }

  range(lo: number, hi: number): number {
    return lo + (hi - lo) * this.next();
  }

  int(n: number): number {
    return Math.floor(this.next() * n);
  }

  chance(p: number): boolean {
    return this.next() < p;
  }

  /** Standard normal via Box–Muller (uses two draws, no caching so state stays simple). */
  normal(): number {
    const u = Math.max(1e-12, this.next());
    const v = this.next();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  /** Poisson sample (Knuth for small lambda, normal approximation above 30). */
  poisson(lambda: number): number {
    if (!(lambda > 0)) return 0;
    if (lambda > 30) return Math.max(0, Math.round(lambda + Math.sqrt(lambda) * this.normal()));
    const L = Math.exp(-lambda);
    let k = 0;
    let p = 1;
    do {
      k++;
      p *= this.next();
    } while (p > L && k < 200);
    return k - 1;
  }

  pick<T>(arr: readonly T[]): T {
    return arr[this.int(arr.length)];
  }

  clone(): Rng {
    return new Rng(new Uint32Array(this.s));
  }
}

/** cyrb128 string hash -> four 32-bit seeds. */
export function cyrb128(str: string): [number, number, number, number] {
  let h1 = 1779033703, h2 = 3144134277, h3 = 1013904242, h4 = 2773480762;
  for (let i = 0; i < str.length; i++) {
    const k = str.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  h1 ^= h2 ^ h3 ^ h4;
  h2 ^= h1;
  h3 ^= h1;
  h4 ^= h1;
  return [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0];
}
