import { Noise } from '../noise';
import { clamp, lerp, smoothstep } from '../math';
import { HALF } from '../config';

/**
 * Continuous terrain description for Meridian Bay. The same function feeds the coarse
 * simulation grid (cell centres) and the high-resolution render mesh, so what you see
 * is what the flood/fire models use (at 32 m resolution).
 *
 * Layout (north = -z, sea = +z):
 *   west  : deep-water harbour basin with piers, industrial belt and power station
 *   centre: river mouth, Old Town on both banks, downtown towers on the waterfront
 *   east  : "Eastport" reclaimed polder, below mean sea level, protected by a levee
 *   north : residential hills rising to a forested ridge
 */
export class TerrainModel {
  readonly noise: Noise;
  readonly seed: number;
  static readonly POLDER_X0 = 600;
  static readonly POLDER_X1 = 800;
  static readonly POLDER_BULGE = 330;
  static readonly POLDER_INLAND = 330;
  static readonly HARBOR_X0 = -1880;
  static readonly HARBOR_X1 = -760;
  static readonly PIERS = [-1640, -1340, -1040];

  constructor(seed: number) {
    this.seed = seed;
    this.noise = new Noise(seed);
  }

  /** Natural coastline z (before land reclamation), land lies at z < coast. */
  baseCoast(x: number): number {
    const n = this.noise.noise2(x / 520 + 11.3, 3.7) * 45;
    let c = 560 + 150 * Math.sin(x / 620 + 0.4) + 70 * Math.sin(x / 250 + 1.7) + n;
    // Harbour basin carved into the west coast.
    const hb = smoothstep(TerrainModel.HARBOR_X0 - 140, TerrainModel.HARBOR_X0 + 60, x) * (1 - smoothstep(TerrainModel.HARBOR_X1 - 60, TerrainModel.HARBOR_X1 + 140, x));
    c -= 400 * hb;
    return c;
  }

  polderFactor(x: number): number {
    return smoothstep(TerrainModel.POLDER_X0, TerrainModel.POLDER_X1, x);
  }

  /** Actual coastline including the reclaimed Eastport polder bulge. */
  coastZ(x: number): number {
    return this.baseCoast(x) + TerrainModel.POLDER_BULGE * this.polderFactor(x);
  }

  riverX(z: number): number {
    return -440 + 150 * Math.sin((z + HALF) / 640) + 55 * Math.sin(z / 233 + 0.7) + this.noise.noise2(1.3, z / 700) * 35;
  }

  riverHalfWidth(z: number): number {
    return 46 + 16 * clamp((z + HALF) / 2600, 0, 1);
  }

  /** River bed elevation at latitude z. */
  riverBed(z: number): number {
    const mouth = this.coastZ(this.riverX(z));
    const t = clamp((z + HALF) / (mouth + HALF), 0, 1);
    return lerp(15, -5, Math.pow(t, 0.8));
  }

  /** Inland distance from the coast (negative at sea). */
  inland(x: number, z: number): number {
    return this.coastZ(x) - z;
  }

  /** 0..1 membership of the reclaimed polder bowl. */
  polder(x: number, z: number): number {
    const pf = this.polderFactor(x);
    if (pf <= 0) return 0;
    const inner = this.baseCoast(x) - TerrainModel.POLDER_INLAND;
    const s = smoothstep(inner - 70, inner + 90, z);
    return pf * s * (this.inland(x, z) > -5 ? 1 : 0);
  }

  inPier(x: number, z: number): boolean {
    const bc = this.baseCoast(x);
    const shore = 560 + 150 * Math.sin(x / 620 + 0.4) + 70 * Math.sin(x / 250 + 1.7) - 20;
    for (const px of TerrainModel.PIERS) {
      if (Math.abs(x - px) < 52 && z > bc - 30 && z < shore) return true;
    }
    return false;
  }

  /** Ground elevation (m above mean sea level). */
  height(x: number, z: number): number {
    const d = this.inland(x, z);
    const n = this.noise;

    if (this.inPier(x, z)) return 3.2;

    if (d < 0) {
      // sea floor
      const hb = this.baseCoast(x) < 400 ? 1 : 0; // harbour: dredged
      const depth = hb ? 13 : Math.min(30, 1.2 - d * 0.035);
      return -1 - depth + n.noise2(x / 300, z / 300) * 0.8;
    }

    // Land surface: gentle rise inland plus hills that grow with distance from the sea.
    const hillMask = smoothstep(450, 1900, d);
    let h = 1.6 + d * 0.0145 + hillMask * (n.fbm2(x / 900 + 3.1, z / 900 - 1.7, 5) * 26 + 10);
    // Forested ridge in the north-west.
    const ridge = n.ridged2(x / 1100 + 7.7, z / 1100 + 2.2, 4);
    h += smoothstep(1300, 2400, d) * smoothstep(-200, -1500, x) * ridge * 70;
    // Eastern hills.
    h += smoothstep(1500, 2500, d) * smoothstep(900, 1900, x) * 30 * (0.5 + 0.5 * n.noise2(x / 600, z / 600));
    // Beach / waterfront flattening near the coast.
    h = lerp(1.2 + d * 0.01, h, smoothstep(0, 140, d));

    // River valley and channel.
    const rx = this.riverX(z);
    const rd = Math.abs(x - rx);
    const bed = this.riverBed(z);
    const banks = Math.max(bed + 4.6, 1.8);
    const valley = 1 - smoothstep(90, 460, rd);
    h = lerp(h, Math.min(h, banks + rd * 0.01), valley);
    const hw = this.riverHalfWidth(z);
    if (rd < hw + 20) {
      const ch = 1 - smoothstep(hw - 18, hw + 20, rd);
      h = lerp(h, bed, ch);
    }

    // Reclaimed polder bowl (below sea level).
    const p = this.polder(x, z);
    if (p > 0) {
      const bowl = -1.35 + n.fbm2(x / 350, z / 350, 3) * 0.6 + smoothstep(TerrainModel.POLDER_BULGE, 0, d) * 0.4;
      h = lerp(h, bowl, p);
    }
    return h;
  }

  /** River channel membership test (used for zoning). */
  inRiver(x: number, z: number): boolean {
    if (this.inland(x, z) < 0) return false;
    return Math.abs(x - this.riverX(z)) < this.riverHalfWidth(z);
  }
}
