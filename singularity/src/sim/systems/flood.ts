import { CELL, CELL_AREA, GRID, N_CELLS, STEP_SECONDS } from '../config';
import type { Simulation } from '../engine';

/**
 * Terrain-aware 2D flood routing on the 128x128 grid using the local-inertial
 * approximation of the shallow-water equations (Bates, Horritt & Fewtrell 2010):
 *
 *   q' = (q - g h_f dt dη/dx) / (1 + g dt n² |q| / h_f^(7/3))
 *
 * where q is the unit-width discharge across each cell face (m²/s), h_f the flow depth
 * over the higher bed, η the water surface and n Manning's roughness. Advection is
 * neglected (acceptable for sub-critical urban floods). Stability: dt ≤ 0.7 dx / sqrt(g h).
 * A positivity limiter scales face fluxes so no cell ever drains below zero, which keeps
 * the scheme mass-conservative apart from explicit sources/sinks. This is an
 * approximation, not a full hydrodynamic solver.
 */

const G = 9.81;
const V_MAX = 8; // m/s cap on face velocity
const DRY = 1e-4;
const HF_MIN = 1e-3;

export interface FloodWork {
  zEff: Float32Array;
  outV: Float32Array;
  scale: Float32Array;
}

export function makeFloodWork(): FloodWork {
  return {
    zEff: new Float32Array(N_CELLS),
    outV: new Float32Array(N_CELLS),
    scale: new Float32Array(N_CELLS),
  };
}

/** Largest stable sub-step for the current depths (ocean-ocean faces are skipped). */
export function stableDt(h: Float32Array, ocean: Uint8Array | null): number {
  let hmax = 0.1;
  for (let c = 0; c < N_CELLS; c++) {
    if (ocean && ocean[c]) continue;
    if (h[c] > hmax) hmax = h[c];
  }
  return (0.7 * CELL) / Math.sqrt(G * Math.min(hmax, 60));
}

/**
 * Advances water depth `h` and face fluxes `qx`/`qz` by `dt` seconds (sub-stepped for
 * stability). `ocean` marks fixed-level sea cells whose mutual faces are skipped; pass
 * `null` for a closed basin (used by the conservation tests).
 */
export function routeWater(
  h: Float32Array,
  z: Float32Array,
  manning: Float32Array,
  qx: Float32Array,
  qz: Float32Array,
  dt: number,
  w: FloodWork,
  ocean: Uint8Array | null,
  seaSurface = 0,
) {
  const maxDt = stableDt(h, ocean);
  const n = Math.min(8, Math.max(1, Math.ceil(dt / maxDt)));
  const dts = dt / n;
  for (let k = 0; k < n; k++) {
    substep(h, z, manning, qx, qz, dts, w, ocean);
    if (ocean) {
      for (let c = 0; c < N_CELLS; c++) {
        if (!ocean[c]) continue;
        const d = seaSurface - z[c];
        h[c] = d > 0 ? d : 0;
      }
    }
  }
}

function faceFlux(q0: number, ha: number, za: number, hb: number, zb: number, nn: number, dt: number): number {
  const ea = za + ha;
  const eb = zb + hb;
  const hf = (ea > eb ? ea : eb) - (za > zb ? za : zb);
  if (hf <= HF_MIN) return 0;
  const slope = (eb - ea) / CELL;
  const hf73 = hf * hf * Math.cbrt(hf);
  const aq = q0 < 0 ? -q0 : q0;
  let q = (q0 - G * hf * dt * slope) / (1 + (G * dt * nn * nn * aq) / hf73);
  const qmax = V_MAX * hf;
  if (q > qmax) q = qmax;
  else if (q < -qmax) q = -qmax;
  return q;
}

function substep(h: Float32Array, z: Float32Array, manning: Float32Array, qx: Float32Array, qz: Float32Array, dt: number, w: FloodWork, ocean: Uint8Array | null) {
  const { outV, scale } = w;
  // 1) momentum update on every face
  for (let j = 0; j < GRID; j++) {
    const row = j * GRID;
    for (let i = 0; i < GRID; i++) {
      const c = row + i;
      const ha = h[c];
      if (i < GRID - 1) {
        const b = c + 1;
        if ((ocean && ocean[c] && ocean[b]) || (ha <= DRY && h[b] <= DRY)) qx[c] = 0;
        else qx[c] = faceFlux(qx[c], ha, z[c], h[b], z[b], 0.5 * (manning[c] + manning[b]), dt);
      } else qx[c] = 0;
      if (j < GRID - 1) {
        const b = c + GRID;
        if ((ocean && ocean[c] && ocean[b]) || (ha <= DRY && h[b] <= DRY)) qz[c] = 0;
        else qz[c] = faceFlux(qz[c], ha, z[c], h[b], z[b], 0.5 * (manning[c] + manning[b]), dt);
      } else qz[c] = 0;
    }
  }
  // 2) positivity: outgoing volume of each cell may not exceed what it holds
  const k = dt / CELL; // depth change per unit q
  for (let c = 0; c < N_CELLS; c++) {
    const i = c % GRID;
    let out = 0;
    const e = qx[c];
    if (e > 0) out += e;
    if (i > 0) {
      const wv = qx[c - 1];
      if (wv < 0) out -= wv;
    }
    const sv = qz[c];
    if (sv > 0) out += sv;
    if (c >= GRID) {
      const nv = qz[c - GRID];
      if (nv < 0) out -= nv;
    }
    out *= k;
    outV[c] = out;
    const hc = h[c];
    scale[c] = out > hc ? (out > 0 ? hc / out : 0) : 1;
  }
  for (let c = 0; c < N_CELLS; c++) {
    const e = qx[c];
    if (e > 0) qx[c] = e * scale[c];
    else if (e < 0) qx[c] = e * scale[c + 1];
    const sv = qz[c];
    if (sv > 0) qz[c] = sv * scale[c];
    else if (sv < 0) qz[c] = sv * scale[c + GRID];
  }
  // 3) continuity
  for (let c = 0; c < N_CELLS; c++) {
    const i = c % GRID;
    let net = -qx[c] - qz[c];
    if (i > 0) net += qx[c - 1];
    if (c >= GRID) net += qz[c - GRID];
    const nh = h[c] + net * k;
    h[c] = nh > 1e-7 ? nh : 0;
  }
}

export function updateFlood(sim: Simulation) {
  const s = sim.s;
  const city = sim.city;
  const d = sim.d;
  const w = sim.floodWork;
  const dt = STEP_SECONDS;
  const h = s.water;
  const z = w.zEff;
  const eff = s.eff;

  for (let c = 0; c < N_CELLS; c++) z[c] = city.terrain[c] - s.settlement[c] + s.levee[c];

  // --- sources and sinks
  const rainMs = eff.rainfall / 3.6e6;
  const sat = s.env.soilSaturation;
  const infilScale = Math.max(0, 1 - 0.92 * sat);
  const pumpDemand = sim.pumpDemand;
  pumpDemand.fill(0);
  for (let c = 0; c < N_CELLS; c++) {
    if (city.ocean[c]) continue;
    let hc = h[c] + rainMs * (0.35 + 1.3 * s.clouds[d.wxOfCell[c]]) * dt;
    const inf = d.infiltration[c] * infilScale * dt;
    hc = hc > inf ? hc - inf : 0;
    if (city.pumpCatchment[c] < 0) {
      const dr = city.drainCapacity[c] * dt;
      hc = hc > dr ? hc - dr : 0;
    }
    h[c] = hc;
  }
  // Polder: the ditch/canal network routes standing water to the pump stations, which lift
  // it over the levee up to their capacity (only while they have power and are intact).
  const pumpScale = sim.pumpScale;
  pumpScale.fill(0);
  for (const pid of d.assetsByKind.pump) {
    const cells = d.pumpCells[pid];
    if (!cells) continue;
    let vol = 0;
    for (const c of cells) vol += h[c] * CELL_AREA;
    pumpDemand[pid] = vol;
    sim.pumpedVolume[pid] = 0;
    if (vol <= 0 || s.aOperational[pid] < 1) continue;
    const cap = city.assets[pid].capacity * sim.scenario.resilience.pumpCapacityScale * dt;
    const f = Math.min(1, cap / vol);
    pumpScale[pid] = f;
    sim.pumpedVolume[pid] = Math.min(cap, vol);
    for (const c of cells) h[c] -= h[c] * f;
  }
  // River inflow at the northern boundary.
  if (city.riverInflow.length) {
    const dh = (s.riverQ * dt) / (CELL_AREA * city.riverInflow.length);
    for (const c of city.riverInflow) h[c] += dh;
  }

  // --- routing (open sea is a fixed-level boundary)
  routeWater(h, z, d.manning, s.qx, s.qz, dt, w, city.ocean, eff.seaSurface);

  // --- land cells on the domain border are free-outflow boundaries (water leaves the map)
  for (const c of sim.d.edgeOutflow) h[c] = 0;

  // --- levee overtopping erosion
  updateLevees(sim);

  // --- bookkeeping
  const mw = s.maxWater;
  for (let c = 0; c < N_CELLS; c++) {
    const v = h[c];
    if (!(v >= 0 && v < 1000)) {
      h[c] = 0;
      s.repairedNaN++;
      continue;
    }
    if (v > 0.05 && !city.ocean[c]) {
      const q = Math.min(255, Math.round(v * 20));
      if (q > mw[c]) mw[c] = q;
    }
  }
}

function updateLevees(sim: Simulation) {
  const s = sim.s;
  const city = sim.city;
  const dt = STEP_SECONDS;
  const sea = s.eff.seaSurface;
  for (const seg of city.levees) {
    let over = 0;
    let lowest = Infinity;
    let lx = seg.x;
    let lz = seg.z;
    for (const c of seg.cells) {
      const crest = city.terrain[c] - s.settlement[c] + s.levee[c];
      if (crest < lowest) {
        lowest = crest;
        const cc = sim.cellCenter(c);
        lx = cc.x;
        lz = cc.z;
      }
      const depth = s.water[c];
      if (depth > 0.02 && sea > crest - 0.05) {
        over++;
        // Headcut erosion of the embankment: faster once it is already weakened.
        const weak = s.lsSettled[seg.id] > 0.2 ? 2.5 : 1;
        const rate = 0.0009 * Math.pow(Math.min(depth, 3), 1.5) * weak;
        s.levee[c] = Math.max(0, s.levee[c] - rate * dt);
      }
    }
    const st = s.lsState[seg.id];
    if (over > 0 && st === 0) {
      s.lsState[seg.id] = 1;
      const causes = [s.lsEvent[seg.id], ...s.storms.map((x) => x.eventId), ...s.pulses.filter((p) => p.kind === 'surge').map((p) => p.eventId)];
      s.lsEvent[seg.id] = sim.emit({
        type: 'levee_overtop',
        category: 'flood',
        severity: 3,
        title: `${seg.name} overtopped`,
        detail: `Sea level ${sea.toFixed(2)} m (tide ${s.eff.tide.toFixed(2)} m + surge ${s.eff.surge.toFixed(2)} m) exceeds the lowest crest ${lowest.toFixed(2)} m. Overflow is eroding the embankment.`,
        x: lx,
        z: lz,
        causes,
        subject: { kind: 'levee', id: seg.id },
        radius: 600,
      });
    }
    if (st < 2) {
      // Breach when a cell's embankment has eroded to under 35 % of its original height.
      let breached = false;
      for (const c of seg.cells) {
        const orig = city.leveeHeight[c] + sim.scenario.resilience.leveeRaise;
        if (orig > 0.5 && s.levee[c] < orig * 0.35) breached = true;
      }
      if (breached) {
        s.lsState[seg.id] = 2;
        s.lsEvent[seg.id] = sim.emit({
          type: 'levee_breach',
          category: 'flood',
          severity: 3,
          title: `${seg.name} breached`,
          detail: 'Overflow erosion opened a breach; the sea now flows freely into the Eastport polder.',
          x: lx,
          z: lz,
          causes: [s.lsEvent[seg.id]],
          subject: { kind: 'levee', id: seg.id },
          radius: 700,
        });
      }
    }
  }
}

/** Command: open a breach of `width` cells centred on the segment's lowest point. */
export function breachLevee(sim: Simulation, segment: number, width: number, cause: number[]) {
  const s = sim.s;
  const seg = sim.city.levees[segment];
  if (!seg) return;
  const sorted = [...seg.cells];
  const mid = Math.floor(sorted.length / 2);
  const half = Math.max(1, Math.round(width));
  for (let k = Math.max(0, mid - half); k < Math.min(sorted.length, mid + half); k++) s.levee[sorted[k]] = 0;
  s.lsState[segment] = 2;
  s.lsEvent[segment] = sim.emit({
    type: 'levee_breach',
    category: 'flood',
    severity: 3,
    title: `${seg.name} breached (${half * 2 * 32} m)`,
    detail: 'Breach opened by operator scenario command.',
    x: seg.x,
    z: seg.z,
    causes: cause,
    subject: { kind: 'levee', id: segment },
    radius: 700,
  });
}

/** Fills ocean cells to sea level and the river channel, then lets the river settle. */
export function spinUpWater(sim: Simulation, steps: number) {
  const s = sim.s;
  const city = sim.city;
  const w = sim.floodWork;
  for (let c = 0; c < N_CELLS; c++) w.zEff[c] = city.terrain[c] - s.settlement[c] + s.levee[c];
  for (let c = 0; c < N_CELLS; c++) {
    if (city.ocean[c]) s.water[c] = Math.max(0, s.eff.seaSurface - w.zEff[c]);
    else if (city.zone[c] === 1) s.water[c] = 0.6;
  }
  const dh = (s.riverQ * STEP_SECONDS) / (CELL_AREA * Math.max(1, city.riverInflow.length));
  for (let k = 0; k < steps; k++) {
    for (const c of city.riverInflow) s.water[c] += dh;
    routeWater(s.water, w.zEff, sim.d.manning, s.qx, s.qz, STEP_SECONDS, w, city.ocean, s.eff.seaSurface);
  }
  // Remove incidental puddles away from the river/sea created by the spin-up.
  for (let c = 0; c < N_CELLS; c++) if (!city.ocean[c] && city.zone[c] !== 1 && s.water[c] < 0.05) s.water[c] = 0;
}
