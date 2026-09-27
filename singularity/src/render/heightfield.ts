import { HALF, WORLD } from '../sim/config';
import { TerrainModel } from '../sim/city/terrainModel';
import { smoothstep } from '../sim/math';

/**
 * High-resolution render heightfield sampled from the same continuous terrain model the
 * simulation grid uses. Also provides the far landscape beyond the simulated domain.
 */
export class HeightField {
  readonly res: number;
  readonly step: number;
  readonly h: Float32Array;
  readonly tm: TerrainModel;

  constructor(seed: number, res = 257) {
    this.tm = new TerrainModel(seed);
    this.res = res;
    this.step = WORLD / (res - 1);
    this.h = new Float32Array(res * res);
    for (let j = 0; j < res; j++) {
      for (let i = 0; i < res; i++) this.h[j * res + i] = this.tm.height(-HALF + i * this.step, -HALF + j * this.step);
    }
  }

  /** Bilinear height inside the domain; analytic terrain outside. */
  at(x: number, z: number): number {
    const fx = (x + HALF) / this.step;
    const fz = (z + HALF) / this.step;
    if (fx < 0 || fz < 0 || fx > this.res - 1 || fz > this.res - 1) return this.far(x, z);
    const i = Math.min(this.res - 2, Math.floor(fx));
    const j = Math.min(this.res - 2, Math.floor(fz));
    const tx = fx - i;
    const tz = fz - j;
    const r = this.res;
    const a = this.h[j * r + i];
    const b = this.h[j * r + i + 1];
    const c = this.h[(j + 1) * r + i];
    const d = this.h[(j + 1) * r + i + 1];
    return (a * (1 - tx) + b * tx) * (1 - tz) + (c * (1 - tx) + d * tx) * tz;
  }

  /** Landscape outside the city: coast continues, mountains rise in the north. */
  far(x: number, z: number): number {
    const tm = this.tm;
    const d = tm.baseCoast(x) + TerrainModel.POLDER_BULGE * tm.polderFactor(x) * (1 - smoothstep(HALF, HALF + 500, x)) - z;
    if (d < 0) return -2 - Math.min(40, -d * 0.03);
    let h = tm.height(x, z);
    if (tm.polder(x, z) > 0.1) h = Math.max(h, 1.2);
    const m = smoothstep(2600, 9000, d);
    if (m > 0) h += m * (120 + 420 * tm.noise.ridged2(x / 3800 + 11, z / 3800 - 5, 5));
    // valley along the river keeps the upstream river visible
    const rd = Math.abs(x - tm.riverX(z));
    if (z < -HALF) h = Math.min(h, 20 + rd * 0.06 + Math.max(0, rd - 300) * 0.25);
    return h;
  }
}
