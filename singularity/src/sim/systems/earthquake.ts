import { GRID, HALF, N_CELLS, STEP_SECONDS, cellX, cellZ } from '../config';
import { FRAGILITY, FRAGILITY_BETA } from '../city/generate';
import { clamp, fragility, hashUnit } from '../math';
import type { Simulation } from '../engine';
import { SClass, type QuakeState } from '../types';

export const VS = 3500; // shear-wave speed, m/s
export const DS_RATIO = [0, 0.02, 0.1, 0.5, 1.0];
export const DS_NAMES = ['None', 'Slight', 'Moderate', 'Extensive', 'Complete / collapse'];

/**
 * Peak ground acceleration on rock (g). Simplified ground-motion model:
 *   log10 PGA = -1.787 + 0.375 M - log10(R_eff) - 0.0015 R,
 * with near-source saturation R_eff = sqrt(R^2 + h^2), h = 10^(-0.405 + 0.235 M) km.
 * Calibrated to give ~0.35 g at 10 km from an M7 on rock; illustrative, not site-specific.
 */
export function pgaRock(magnitude: number, rHypoKm: number): number {
  const h = Math.pow(10, -0.405 + 0.235 * magnitude);
  const reff = Math.sqrt(rHypoKm * rHypoKm + h * h);
  const lg = -1.787 + 0.375 * magnitude - Math.log10(reff) - 0.0015 * rHypoKm;
  return clamp(Math.pow(10, lg), 0, 3);
}

/** Soft/saturated soils amplify shaking (factor 1 on rock, up to ~2 on saturated fill). */
export function siteAmplification(soil: number, saturation: number): number {
  return 1 + soil * (0.55 + 0.45 * clamp(saturation, 0, 1));
}

/** Modified Mercalli Intensity from PGA (Wald et al. 1999). */
export function mmiFromPga(g: number): number {
  if (g <= 0) return 1;
  const cms2 = g * 980.665;
  const mmi = cms2 < 50 ? 2.2 * Math.log10(cms2) + 1 : 3.66 * Math.log10(cms2) - 1.66;
  return clamp(mmi, 1, 12);
}

export function significantDuration(magnitude: number): number {
  return clamp(5 + 7 * Math.pow(Math.max(0, magnitude - 5), 1.3), 3, 120);
}

/** Shaking envelope in [0,1] for time u (s) after S-wave arrival. */
export function envelope(u: number, duration: number): number {
  if (u < 0) return 0;
  const rise = Math.max(1, 0.2 * duration);
  if (u < rise) return u / rise;
  return Math.exp(-(u - rise) / (0.5 * duration));
}

/** Liquefaction-induced settlement (m) for a given PGA on a soil with susceptibility `soil`. */
export function liquefactionSettlement(pga: number, soil: number, saturation: number): number {
  if (soil < 0.35) return 0;
  const thr = 0.09 + 0.1 * (1 - clamp(saturation, 0, 1));
  if (pga <= thr) return 0;
  return soil * clamp((pga - thr) * 1.1, 0, 0.6) * (0.4 + 0.8 * clamp(saturation, 0, 1));
}

export function buildingMedians(sclass: number, height: number, retrofit: boolean, dsStart: number): [number, number, number, number] {
  const base = FRAGILITY[sclass] ?? FRAGILITY[SClass.RCModern];
  let f = 1;
  if (retrofit && (sclass === SClass.URM || sclass === SClass.RCPreCode)) f *= 1.6;
  if (height > 60) f *= 1.15; // PGA is a weaker damage predictor for long-period structures
  f *= 1 - 0.12 * dsStart; // prior damage weakens the structure
  return [base[0] * f, base[1] * f, base[2] * f, base[3] * f];
}

/** Damage state (0..4) for demand `pga`, medians and a uniform draw u (same u across states keeps them nested). */
export function damageState(pga: number, medians: readonly number[], beta: number, u: number): number {
  for (let k = 3; k >= 0; k--) if (u < fragility(pga, medians[k], beta)) return k + 1;
  return 0;
}

const compass = (dx: number, dz: number): string => {
  const ang = ((Math.atan2(dx, -dz) * 180) / Math.PI + 360) % 360;
  return ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(ang / 45) % 8];
};

export function startQuake(sim: Simulation, p: { x: number; z: number; magnitude: number; depthKm: number; durationS?: number; aftershocks: boolean }, aftershock: boolean, parentEvent: number, causes: number[] = []): QuakeState {
  const s = sim.s;
  const anyActive = s.quakes.some((q) => !q.done);
  const id = s.nextQuakeId++;
  const duration = p.durationS ?? significantDuration(p.magnitude);
  const dtc = sim.city.districts[3];
  const dx = p.x - dtc.cx;
  const dz = p.z - dtc.cz;
  const distKm = Math.hypot(dx, dz) / 1000;
  const sev: 0 | 1 | 2 | 3 = p.magnitude >= 6.5 ? 3 : p.magnitude >= 5.5 ? 2 : p.magnitude >= 4.8 ? 1 : 0;
  const eventId = sim.emit({
    type: aftershock ? 'aftershock' : 'earthquake',
    category: 'seismic',
    severity: sev,
    title: `M${p.magnitude.toFixed(1)} ${aftershock ? 'aftershock' : 'earthquake'}`,
    detail: `Hypocentre ${p.depthKm.toFixed(0)} km deep, ${distKm < 0.5 ? 'beneath Downtown' : `${distKm.toFixed(1)} km ${compass(dx, dz)} of Downtown`}; ~${duration.toFixed(0)} s of strong shaking. Rock PGA at Downtown ≈ ${pgaRock(p.magnitude, Math.hypot(distKm, p.depthKm)).toFixed(2)} g.`,
    x: p.x,
    z: p.z,
    causes: aftershock ? [parentEvent, ...causes] : causes,
    radius: aftershock ? 1800 : 3200,
  });
  const q: QuakeState = {
    id,
    eventId,
    x: p.x,
    z: p.z,
    depthKm: p.depthKm,
    magnitude: p.magnitude,
    startTick: s.tick,
    duration,
    aftershock,
    aftershocks: p.aftershocks && !aftershock,
    parentEvent,
    done: false,
    summarized: false,
    peakSeen: 0,
  };
  if (!anyActive) {
    // New shaking episode: reset running peaks and remember pre-event damage.
    s.episode = id;
    s.episodeEvent = eventId;
    s.bPeak.fill(0);
    s.bDSStart.set(s.bDS);
    s.aPeak.fill(0);
    s.brPeak.fill(0);
    s.lPeak.fill(0);
  }
  s.quakes.push(q);
  // bound history: keep active quakes and mainshocks still producing aftershocks
  if (s.quakes.length > 24) {
    const keep = s.quakes.filter((k) => !k.done || (!k.aftershock && k.aftershocks));
    s.quakes = keep.slice(-24);
  }
  return q;
}

const MAX_R = Math.hypot(HALF * 2, HALF * 2);

export function updateEarthquakes(sim: Simulation) {
  const s = sim.s;
  const dt = STEP_SECONDS;
  const t = s.tick * dt;
  const city = sim.city;
  generateAftershocks(sim, t);

  const active = s.quakes.filter((q) => !q.done);
  if (active.length === 0) {
    if (sim.shakingActive) {
      sim.shaking.fill(0);
      sim.shakingActive = false;
    }
    return;
  }
  sim.shaking.fill(0);
  sim.shakingActive = true;
  const sat = s.env.soilSaturation;

  for (const q of active) {
    const el = t - q.startTick * dt;
    const depthM = q.depthKm * 1000;
    // Skip cells the wave has not reached yet / has long passed.
    for (let j = 0; j < GRID; j++) {
      const z = cellZ(j);
      const dz = z - q.z;
      for (let i = 0; i < GRID; i++) {
        const x = cellX(i);
        const dx = x - q.x;
        const R = Math.sqrt(dx * dx + dz * dz + depthM * depthM);
        const u = el - R / VS;
        if (u < 0) continue;
        const env = envelope(u, q.duration);
        if (env < 0.003) continue;
        const c = j * GRID + i;
        const a = pgaRock(q.magnitude, R / 1000) * siteAmplification(city.soil[c], sat) * env;
        if (a > sim.shaking[c]) sim.shaking[c] = a;
        if (a > s.peakPGA[c]) s.peakPGA[c] = a;
      }
    }
    if (el > MAX_R / VS + q.duration * 6 + 2 * q.depthKm) q.done = true;
  }

  // Liquefaction-induced settlement from the peak shaking experienced so far.
  for (let c = 0; c < N_CELLS; c++) {
    const pga = s.peakPGA[c];
    if (pga < 0.09) continue;
    const target = liquefactionSettlement(pga, city.soil[c], sat);
    const delta = target - s.settlement[c];
    if (delta > 0.001) {
      s.settlement[c] = target;
      const lh = s.levee[c];
      if (lh > 0) {
        // Embankments slump more than the ground they sit on.
        s.levee[c] = Math.max(0, lh - delta * 1.2);
        const seg = city.leveeSegment[c];
        if (seg >= 0) s.lsSettled[seg] += (delta * 2.2) / Math.max(1, city.levees[seg].cells.length);
      }
    }
  }

  const q0 = active[active.length - 1];
  const cause = q0.eventId;
  const seed = sim.scenario.seed;
  const res = sim.scenario.resilience;

  // Buildings.
  const b = city.buildings;
  for (let k = 0; k < b.count; k++) {
    if (b.asset[k] >= 0) continue; // critical facilities use their own asset fragility
    const a = sim.shaking[b.cell[k]];
    if (a <= s.bPeak[k]) continue;
    s.bPeak[k] = a;
    if (s.bDS[k] >= 4) continue;
    const med = buildingMedians(b.sclass[k], b.h[k], res.buildingRetrofit, s.bDSStart[k]);
    const ds = damageState(a, med, FRAGILITY_BETA, hashUnit(seed, k, s.episode, 1));
    if (ds > s.bDS[k]) sim.setBuildingDS(k, ds, cause);
  }

  // Infrastructure assets.
  for (const as of city.assets) {
    const a = sim.shaking[as.cell];
    if (a <= s.aPeak[as.id]) continue;
    s.aPeak[as.id] = a;
    let f = 1;
    if (res.substationRetrofit && (as.kind === 'sub' || as.kind === 'tx')) f = 1.7;
    const med = as.fragility.map((m) => m * f);
    const ds = damageState(a, med, as.beta, hashUnit(seed, 100000 + as.id, s.episode, 2));
    if (ds > s.aDS[as.id]) sim.setAssetDS(as.id, ds, cause, a, med);
  }

  // Power lines: the weakest pylon governs.
  for (const l of city.lines) {
    if (s.lDamaged[l.id]) continue;
    let m = 0;
    for (let k = 0; k < l.points.length; k += 2) {
      const i = clamp(Math.floor((l.points[k] + HALF) / 32), 0, GRID - 1);
      const j = clamp(Math.floor((l.points[k + 1] + HALF) / 32), 0, GRID - 1);
      m = Math.max(m, sim.shaking[j * GRID + i]);
    }
    if (m <= s.lPeak[l.id]) continue;
    s.lPeak[l.id] = m;
    const p = fragility(m, l.quakeMedian, 0.6);
    if (hashUnit(seed, 200000 + l.id, s.episode, 3) < p) {
      s.lDamaged[l.id] = 1;
      s.lEvent[l.id] = sim.emit({
        type: 'line_failure',
        category: 'power',
        severity: 2,
        title: `${l.name} down`,
        detail: `Pylon PGA ${m.toFixed(2)} g exceeded the line's median capacity ${l.quakeMedian.toFixed(2)} g.`,
        x: (l.points[0] + l.points[l.points.length - 2]) / 2,
        z: (l.points[1] + l.points[l.points.length - 1]) / 2,
        causes: [cause],
        subject: { kind: 'line', id: l.id },
        radius: 900,
      });
    }
  }

  // Bridges: lateral spreading at liquefied abutments amplifies demand.
  for (const br of city.bridges) {
    if (s.brDS[br.id] >= 4) continue;
    let a = 0;
    let settle = 0;
    for (const c of br.cells) a = Math.max(a, sim.shaking[c]);
    const g = city.roads;
    const e = br.edge;
    for (let k = g.edgeCellStart[e]; k < g.edgeCellStart[e + 1]; k++) settle = Math.max(settle, s.settlement[g.edgeCells[k]]);
    const demand = a * (1 + Math.min(0.6, settle * 1.5));
    if (demand <= s.brPeak[br.id]) continue;
    s.brPeak[br.id] = demand;
    const ds = damageState(demand, br.fragility, 0.6, hashUnit(seed, 300000 + br.id, s.episode, 4));
    if (ds > s.brDS[br.id]) {
      s.brDS[br.id] = ds;
      if (ds >= 2) {
        const collapse = ds >= 4;
        const liq = settle > 0.05 ? s.dLiqEvent[Math.max(0, city.district[br.cells[0] ?? 0])] : -1;
        s.brEvent[br.id] = sim.emit({
          type: collapse ? 'bridge_collapse' : 'bridge_damage',
          category: 'transport',
          severity: ds >= 3 ? 3 : 2,
          title: collapse ? `${br.name} collapsed` : ds === 3 ? `${br.name} severely damaged — closed` : `${br.name} damaged — reduced capacity`,
          detail: `Deck demand ${demand.toFixed(2)} g (PGA ${a.toFixed(2)} g${settle > 0.05 ? `, abutment settlement ${settle.toFixed(2)} m` : ''}) vs medians ${br.fragility.map((m) => m.toFixed(2)).join('/')} g. Built ${br.year}.`,
          x: br.x,
          z: br.z,
          causes: liq >= 0 ? [cause, liq] : [cause],
          subject: { kind: 'bridge', id: br.id },
          radius: 450,
        });
        sim.routingDirty();
      }
    }
  }

  // When the whole episode has finished, summarise damage per district.
  if (s.quakes.every((q) => q.done)) summarizeEpisode(sim);
}

function summarizeEpisode(sim: Simulation) {
  const s = sim.s;
  const city = sim.city;
  const nd = city.districts.length;
  const ext = new Int32Array(nd);
  const col = new Int32Array(nd);
  const mod = new Int32Array(nd);
  const b = city.buildings;
  for (let k = 0; k < b.count; k++) {
    if (s.bDS[k] <= s.bDSStart[k]) continue;
    const d = b.district[k];
    if (s.bDS[k] >= 4) col[d]++;
    else if (s.bDS[k] === 3) ext[d]++;
    else if (s.bDS[k] === 2) mod[d]++;
  }
  const cause = s.episodeEvent;
  for (let d = 0; d < nd; d++) {
    const dd = city.districts[d];
    if (col[d] + ext[d] >= 1) {
      const id = sim.emit({
        type: col[d] > 0 ? 'building_collapse' : 'building_damage',
        category: 'seismic',
        severity: col[d] >= 10 ? 3 : col[d] > 0 || ext[d] >= 10 ? 2 : 1,
        title: col[d] > 0 ? `${col[d]} building${col[d] > 1 ? 's' : ''} collapsed in ${dd.name}` : `${ext[d]} buildings extensively damaged in ${dd.name}`,
        detail: `${ext[d]} extensive, ${mod[d]} moderate. Unreinforced masonry and pre-code concrete are most vulnerable; soft soils amplify shaking.`,
        x: dd.cx,
        z: dd.cz,
        causes: [cause],
        subject: { kind: 'district', id: d },
        radius: Math.sqrt(dd.cells) * 32 * 0.9,
      });
      s.dCollapseEvent[d] = id;
    }
  }
  // Liquefaction per district.
  const liq = new Int32Array(nd);
  const maxS = new Float32Array(nd);
  for (let c = 0; c < N_CELLS; c++) {
    const d = city.district[c];
    if (d < 0 || s.settlement[c] < 0.05) continue;
    liq[d]++;
    maxS[d] = Math.max(maxS[d], s.settlement[c]);
  }
  for (let d = 0; d < nd; d++) {
    if (liq[d] < 6 || s.dLiqEvent[d] >= 0) continue;
    const dd = city.districts[d];
    s.dLiqEvent[d] = sim.emit({
      type: 'liquefaction',
      category: 'seismic',
      severity: liq[d] > 80 ? 2 : 1,
      title: `Liquefaction in ${dd.name}`,
      detail: `${liq[d]} cells settled (max ${maxS[d].toFixed(2)} m). Saturated fill and alluvium lost strength under shaking.`,
      x: dd.cx,
      z: dd.cz,
      causes: [cause],
      subject: { kind: 'district', id: d },
      radius: Math.sqrt(dd.cells) * 32,
    });
  }
  for (const seg of city.levees) {
    if (s.lsSettled[seg.id] > 0.2 && s.lsEvent[seg.id] < 0) {
      s.lsEvent[seg.id] = sim.emit({
        type: 'liquefaction',
        category: 'flood',
        severity: 2,
        title: `${seg.name} crest lowered ${s.lsSettled[seg.id].toFixed(2)} m`,
        detail: `Embankment slumped on liquefied foundation. Effective crest now ≈ ${(seg.crest + sim.scenario.resilience.leveeRaise - s.lsSettled[seg.id]).toFixed(2)} m above datum.`,
        x: seg.x,
        z: seg.z,
        causes: [cause, s.dLiqEvent[5]],
        subject: { kind: 'levee', id: seg.id },
        radius: 700,
      });
    }
  }
  for (const q of s.quakes) q.summarized = true;
}

function generateAftershocks(sim: Simulation, t: number) {
  const s = sim.s;
  if (!sim.scenario.resilience.aftershocks) return;
  for (const q of s.quakes) {
    if (q.aftershock || !q.aftershocks) continue;
    const elDays = (t - q.startTick * STEP_SECONDS) / 86400;
    if (elDays < 30 / 86400) continue; // first aftershocks after ~30 s
    if (elDays > 0.25) {
      q.aftershocks = false;
      continue;
    }
    const mMin = 4.0;
    if (q.magnitude < mMin + 1) continue;
    // Reasenberg & Jones (1989) generic parameters.
    const rate = Math.pow(10, -1.67 + 0.91 * (q.magnitude - mMin)) * Math.pow(elDays + 0.05, -1.08); // per day
    const n = sim.rng.quake.poisson((rate * STEP_SECONDS) / 86400);
    for (let k = 0; k < n; k++) {
      const u = Math.max(1e-6, sim.rng.quake.next());
      const m = Math.min(q.magnitude - 0.6, mMin - Math.log10(u) / 0.91);
      const L = Math.min(8, Math.pow(10, -2.44 + 0.59 * q.magnitude)) * 1000;
      const x = q.x + sim.rng.quake.normal() * L * 0.25;
      const z = q.z + sim.rng.quake.normal() * L * 0.25;
      const depthKm = 4 + sim.rng.quake.next() * 12;
      startQuake(sim, { x, z, magnitude: Math.round(m * 10) / 10, depthKm, aftershocks: false }, true, q.eventId);
    }
  }
}
