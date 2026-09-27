import { CELL, GRID, N_CELLS, STEP_SECONDS } from '../config';
import { clamp } from '../math';
import type { Simulation } from '../engine';
import { SClass } from '../types';

/**
 * Cellular urban/wildland fire model on the 32 m grid.
 * Burning cells consume fuel and radiate heat to neighbours (8-neighbourhood plus a
 * weaker 2-cell ring, biased downwind). A cell ignites when accumulated heat exceeds a
 * moisture-dependent threshold. Strong winds loft firebrands that start spot fires.
 * Parameters are tuned for plausible urban spread rates (~100-400 m/h), not calibrated.
 */

const GROWTH = 0.0028; // 1/s intensity growth
const BURN_RATE = 0.00036; // fuel fraction per s at full intensity
const SPREAD = 0.0021; // heat transfer coefficient
const COOL = 1 / 600; // heat decay 1/s
const SMOKE_EMIT = 0.016;
const SMOKE_DECAY = 1 / 1500;

const NB: [number, number, number][] = [];
for (let dj = -2; dj <= 2; dj++) {
  for (let di = -2; di <= 2; di++) {
    if (di === 0 && dj === 0) continue;
    const r = Math.hypot(di, dj);
    const w = r <= 1 ? 1 : r < 1.5 ? 0.7 : r <= 2 ? 0.3 : 0.18;
    NB.push([di, dj, w]);
  }
}

export function ignitionThreshold(wetness: number, temperature: number): number {
  const dryness = clamp((temperature + 5) / 40, 0.05, 1);
  return (1 + 3 * wetness) / (0.45 + dryness);
}

export function updateFire(sim: Simulation) {
  const s = sim.s;
  const d = sim.d;
  const dt = STEP_SECONDS;
  const burn = s.burn;
  const heat = s.heat;
  const fuel = s.fuel;
  const eff = s.eff;
  const ws = eff.windSpeed;
  const wux = ws > 0.01 ? eff.windX / ws : 0;
  const wuz = ws > 0.01 ? eff.windZ / ws : 0;
  const rainSup = eff.rainfall * 0.000012; // intensity reduction per s per mm/h (interior fires are sheltered)
  let anyBurning = false;
  let active = 0;
  const newIgn = sim.fireNewIgnitions;
  newIgn.length = 0;

  // 1) burning cells: grow, consume, emit, radiate
  for (let c = 0; c < N_CELLS; c++) {
    let b = burn[c];
    if (b <= 0) continue;
    anyBurning = true;
    if (s.water[c] > 0.25) {
      burn[c] = 0;
      heat[c] = 0;
      continue;
    }
    const f0 = d.fuelLoad[c];
    const wet = s.wetness[d.wxOfCell[c]];
    b += GROWTH * dt * (1 - b) * (1.2 - wet) - rainSup * (1 + wet) * dt;
    fuel[c] -= BURN_RATE * b * dt * Math.max(0.35, f0);
    if (fuel[c] <= 0.02 * f0 || b <= 0.01) {
      burn[c] = 0;
      if (fuel[c] <= 0.02 * f0) {
        fuel[c] = 0;
        s.burned[c] = 1;
      }
      continue;
    }
    b = clamp(b, 0, 1);
    burn[c] = b;
    active++;
    s.smoke[c] += SMOKE_EMIT * b * Math.max(0.3, f0) * dt;
    const i = c % GRID;
    const j = (c / GRID) | 0;
    const out = SPREAD * b * Math.sqrt(Math.max(0.05, f0)) * dt;
    for (let k = 0; k < NB.length; k++) {
      const nb = NB[k];
      const ni = i + nb[0];
      const nj = j + nb[1];
      if (ni < 0 || nj < 0 || ni >= GRID || nj >= GRID) continue;
      const n = nj * GRID + ni;
      if (fuel[n] <= 0.03 || burn[n] > 0) continue;
      const inv = 1 / Math.hypot(nb[0], nb[1]);
      const along = (nb[0] * wux + nb[1] * wuz) * inv;
      const wf = Math.max(0.12, 1 + 0.075 * ws * along);
      heat[n] += out * nb[2] * wf;
    }
    // Firebrand spotting downwind in strong wind.
    if (ws > 9 && b > 0.55 && f0 > 0.3) {
      const p = 0.0015 * (ws - 9) * b * dt;
      if (sim.rng.fire.next() < p) {
        const dist = (2 + sim.rng.fire.next() * 5) * CELL;
        const lat = (sim.rng.fire.next() - 0.5) * 2 * CELL;
        const x = sim.cellCenter(c).x + wux * dist - wuz * lat;
        const z = sim.cellCenter(c).z + wuz * dist + wux * lat;
        const t = sim.cellAt(x, z);
        if (t >= 0 && fuel[t] > 0.1 && burn[t] === 0) heat[t] += 1.2;
      }
    }
  }

  // 2) ignitions and cooling
  const temp = eff.temperature;
  for (let c = 0; c < N_CELLS; c++) {
    const hc = heat[c];
    if (hc <= 0) continue;
    if (burn[c] > 0) {
      heat[c] = 0;
      continue;
    }
    if (!s.burned[c] && fuel[c] > 0.05 && s.water[c] < 0.1) {
      const thr = ignitionThreshold(s.wetness[d.wxOfCell[c]], temp);
      if (hc > thr) {
        burn[c] = 0.06;
        heat[c] = 0;
        newIgn.push(c);
        anyBurning = true;
        continue;
      }
    }
    const nh = hc * (1 - COOL * dt);
    heat[c] = nh < 1e-4 ? 0 : nh;
  }
  sim.fireActiveCells = active;

  // 3) buildings in burning cells take fire damage
  if (anyBurning) {
    const bl = sim.city.buildings;
    for (let c = 0; c < N_CELLS; c++) {
      const b = burn[c];
      if (b <= 0.05) continue;
      for (let k = d.cellBuildStart[c]; k < d.cellBuildStart[c + 1]; k++) {
        const bi = d.cellBuild[k];
        const sc = bl.sclass[bi];
        const vul = sc === SClass.WoodFrame ? 1.4 : sc === SClass.URM ? 1.0 : sc === SClass.SteelLight ? 1.1 : 0.6;
        const nf = Math.min(1, s.bFire[bi] + (b * vul * dt) / 1500);
        s.bFire[bi] = nf;
        const target = nf > 0.9 && (sc === SClass.WoodFrame || sc === SClass.URM || sc === SClass.SteelLight) ? 4 : nf > 0.6 ? 3 : nf > 0.3 ? 2 : nf > 0.1 ? 1 : 0;
        if (target > s.bDS[bi]) sim.setBuildingDS(bi, target, sim.incidentEventAt(c), true);
      }
    }
  }

  // 4) smoke: semi-Lagrangian advection with decay and light diffusion
  advectSmoke(sim);
}

function advectSmoke(sim: Simulation) {
  const s = sim.s;
  const src = s.smoke;
  let total = 0;
  for (let c = 0; c < N_CELLS; c++) total += src[c];
  if (total < 1e-3) {
    if (total > 0) src.fill(0);
    sim.smokeMean = 0;
    return;
  }
  const dst = sim.smokeTmp;
  const dt = STEP_SECONDS;
  const ox = (s.eff.windX * dt) / CELL;
  const oz = (s.eff.windZ * dt) / CELL;
  const decay = 1 - SMOKE_DECAY * dt;
  for (let j = 0; j < GRID; j++) {
    for (let i = 0; i < GRID; i++) {
      const x = i - ox;
      const z = j - oz;
      const x0 = Math.floor(x);
      const z0 = Math.floor(z);
      const fx = x - x0;
      const fz = z - z0;
      const v00 = sample(src, x0, z0);
      const v10 = sample(src, x0 + 1, z0);
      const v01 = sample(src, x0, z0 + 1);
      const v11 = sample(src, x0 + 1, z0 + 1);
      const v = (v00 * (1 - fx) + v10 * fx) * (1 - fz) + (v01 * (1 - fx) + v11 * fx) * fz;
      dst[j * GRID + i] = v;
    }
  }
  // light diffusion + decay, clamp
  let total2 = 0;
  for (let j = 0; j < GRID; j++) {
    for (let i = 0; i < GRID; i++) {
      const c = j * GRID + i;
      const n = (i > 0 ? dst[c - 1] : dst[c]) + (i < GRID - 1 ? dst[c + 1] : dst[c]) + (j > 0 ? dst[c - GRID] : dst[c]) + (j < GRID - 1 ? dst[c + GRID] : dst[c]);
      const v = (dst[c] * 0.84 + n * 0.04) * decay;
      const o = v < 1e-4 ? 0 : v > 8 ? 8 : v;
      src[c] = o;
      total2 += o;
    }
  }
  // mean of the final field (a pure function of state, so it can be recomputed after restore)
  sim.smokeMean = total2 / N_CELLS;
}

function sample(a: Float32Array, i: number, j: number): number {
  if (i < 0 || j < 0 || i >= GRID || j >= GRID) return 0;
  return a[j * GRID + i];
}
