import { Rng } from './rng';

/**
 * Seeded 2D/3D gradient (Perlin-style) noise. Deterministic for a given seed and
 * independent of Math.random.
 */
export class Noise {
  private readonly perm = new Uint8Array(512);
  private readonly gx = new Float32Array(256);
  private readonly gy = new Float32Array(256);
  private readonly gz = new Float32Array(256);

  constructor(seed: number) {
    const rng = Rng.stream(seed, 'noise');
    const p = new Uint8Array(256);
    for (let k = 0; k < 256; k++) p[k] = k;
    for (let k = 255; k > 0; k--) {
      const r = rng.int(k + 1);
      const t = p[k];
      p[k] = p[r];
      p[r] = t;
    }
    for (let k = 0; k < 512; k++) this.perm[k] = p[k & 255];
    for (let k = 0; k < 256; k++) {
      // random unit vectors
      const theta = rng.next() * Math.PI * 2;
      const zz = rng.next() * 2 - 1;
      const r = Math.sqrt(1 - zz * zz);
      this.gx[k] = r * Math.cos(theta);
      this.gy[k] = r * Math.sin(theta);
      this.gz[k] = zz;
    }
  }

  /** 2D noise in roughly [-1, 1]. */
  noise2(x: number, y: number): number {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const xf = x - xi;
    const yf = y - yi;
    const X = xi & 255;
    const Y = yi & 255;
    const p = this.perm;
    const aa = p[p[X] + Y];
    const ab = p[p[X] + Y + 1];
    const ba = p[p[X + 1] + Y];
    const bb = p[p[X + 1] + Y + 1];
    const u = fade(xf);
    const v = fade(yf);
    const n00 = this.gx[aa] * xf + this.gy[aa] * yf;
    const n10 = this.gx[ba] * (xf - 1) + this.gy[ba] * yf;
    const n01 = this.gx[ab] * xf + this.gy[ab] * (yf - 1);
    const n11 = this.gx[bb] * (xf - 1) + this.gy[bb] * (yf - 1);
    const nx0 = n00 + u * (n10 - n00);
    const nx1 = n01 + u * (n11 - n01);
    return (nx0 + v * (nx1 - nx0)) * 1.6;
  }

  /** 3D noise in roughly [-1, 1]; the third axis is typically time. */
  noise3(x: number, y: number, z: number): number {
    const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
    const xf = x - xi, yf = y - yi, zf = z - zi;
    const X = xi & 255, Y = yi & 255, Z = zi & 255;
    const p = this.perm;
    const u = fade(xf), v = fade(yf), w = fade(zf);
    const A = p[X] + Y, AA = p[A] + Z, AB = p[A + 1] + Z;
    const B = p[X + 1] + Y, BA = p[B] + Z, BB = p[B + 1] + Z;
    const g = (h: number, dx: number, dy: number, dz: number) => {
      const k = p[h];
      return this.gx[k] * dx + this.gy[k] * dy + this.gz[k] * dz;
    };
    const x1 = lerpN(g(AA, xf, yf, zf), g(BA, xf - 1, yf, zf), u);
    const x2 = lerpN(g(AB, xf, yf - 1, zf), g(BB, xf - 1, yf - 1, zf), u);
    const x3 = lerpN(g(AA + 1, xf, yf, zf - 1), g(BA + 1, xf - 1, yf, zf - 1), u);
    const x4 = lerpN(g(AB + 1, xf, yf - 1, zf - 1), g(BB + 1, xf - 1, yf - 1, zf - 1), u);
    return lerpN(lerpN(x1, x2, v), lerpN(x3, x4, v), w) * 1.4;
  }

  fbm2(x: number, y: number, octaves = 4, lacunarity = 2, gain = 0.5): number {
    let amp = 1, freq = 1, sum = 0, norm = 0;
    for (let o = 0; o < octaves; o++) {
      sum += amp * this.noise2(x * freq, y * freq);
      norm += amp;
      amp *= gain;
      freq *= lacunarity;
    }
    return sum / norm;
  }

  fbm3(x: number, y: number, z: number, octaves = 4): number {
    let amp = 1, freq = 1, sum = 0, norm = 0;
    for (let o = 0; o < octaves; o++) {
      sum += amp * this.noise3(x * freq, y * freq, z * freq);
      norm += amp;
      amp *= 0.5;
      freq *= 2;
    }
    return sum / norm;
  }

  /** Ridged multifractal, [0, 1]. */
  ridged2(x: number, y: number, octaves = 4): number {
    let amp = 0.5, freq = 1, sum = 0, norm = 0;
    for (let o = 0; o < octaves; o++) {
      const n = 1 - Math.abs(this.noise2(x * freq, y * freq));
      sum += amp * n * n;
      norm += amp;
      amp *= 0.5;
      freq *= 2;
    }
    return sum / norm;
  }
}

function fade(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10);
}
function lerpN(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
