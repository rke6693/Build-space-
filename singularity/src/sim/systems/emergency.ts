import { CELL, GRID, METRIC_INTERVAL, STEP_SECONDS } from '../config';
import type { Simulation } from '../engine';
import { stormParams, TIDE_AMPLITUDE } from './weather';
import { dijkstra } from './routing';
import type { Incident } from '../types';

const CREW_SPEED = 13; // m/s free-flow
const SUPPRESS = 0.0045; // intensity knocked down per s at full water pressure

export function registerIgnition(sim: Simulation, c: number, eventId: number): Incident {
  const s = sim.s;
  const ci = c % GRID;
  const cj = (c / GRID) | 0;
  for (const inc of s.incidents) {
    if (!inc.active) continue;
    const ii = inc.cell % GRID;
    const ij = (inc.cell / GRID) | 0;
    if (Math.max(Math.abs(ii - ci), Math.abs(ij - cj)) <= 6) return inc;
  }
  const covered = sim.commCover[c] && s.commOk;
  const p = sim.cellCenter(c);
  const inc: Incident = {
    id: s.nextIncidentId++,
    eventId,
    cell: c,
    x: p.x,
    z: p.z,
    startTick: s.tick,
    detectTick: s.tick + (covered ? 30 : 300),
    active: true,
    burning: 1,
    maxBurning: 1,
    crews: 0,
    majorReported: false,
    buildingsLost: 0,
    blockedEvent: -1,
  };
  s.incidents.push(inc);
  if (s.incidents.length > 160) {
    const idx = s.incidents.findIndex((x) => !x.active);
    if (idx >= 0) s.incidents.splice(idx, 1);
  }
  return inc;
}

/** Spread-ignitions far from any known incident become new incidents (spot fires). */
export function trackSpreadIgnitions(sim: Simulation) {
  const s = sim.s;
  for (const c of sim.fireNewIgnitions) {
    const ci = c % GRID;
    const cj = (c / GRID) | 0;
    // Continuous spread from an adjacent burning block is part of the same fire.
    let adjacent = false;
    for (let dj = -3; dj <= 3 && !adjacent; dj++) {
      for (let di = -3; di <= 3; di++) {
        if (di === 0 && dj === 0) continue;
        const i = ci + di;
        const j = cj + dj;
        if (i < 0 || j < 0 || i >= GRID || j >= GRID) continue;
        if (s.burn[j * GRID + i] > 0) {
          adjacent = true;
          break;
        }
      }
    }
    if (adjacent) continue;
    let near: Incident | null = null;
    let nearD = Infinity;
    for (const inc of s.incidents) {
      if (!inc.active) continue;
      const dd = Math.max(Math.abs((inc.cell % GRID) - ci), Math.abs(((inc.cell / GRID) | 0) - cj));
      if (dd < nearD) {
        nearD = dd;
        near = inc;
      }
    }
    if (near && nearD <= 6) continue;
    const p = sim.cellCenter(c);
    const ev = sim.emit({
      type: 'fire_ignition',
      category: 'fire',
      severity: 1,
      title: near ? 'Spot fire ignited by windborne embers' : 'New fire front',
      detail: `Heat from ${near ? 'a nearby fire' : 'burning fuel'} ignited ${sim.describeCell(c)}.`,
      x: p.x,
      z: p.z,
      causes: near ? [near.eventId] : [],
      subject: { kind: 'cell', id: c },
      radius: 500,
    });
    registerIgnition(sim, c, ev);
  }
}

export function updateEmergency(sim: Simulation) {
  const s = sim.s;
  const dt = STEP_SECONDS;
  const g = sim.city.roads;
  const N = g.nodeCount;
  const cr = s.crews;
  const waterFactor = s.waterOk >= 1 ? 1 : s.waterOk > 0 ? 0.6 : 0.35;

  // ---- incident bookkeeping
  if (s.tick % METRIC_INTERVAL === 0) {
    for (const inc of s.incidents) {
      if (!inc.active) continue;
      let n = 0;
      let sx = 0;
      let sz = 0;
      const ci = inc.cell % GRID;
      const cj = (inc.cell / GRID) | 0;
      for (let dj = -12; dj <= 12; dj++) {
        for (let di = -12; di <= 12; di++) {
          const i = ci + di;
          const j = cj + dj;
          if (i < 0 || j < 0 || i >= GRID || j >= GRID) continue;
          const c = j * GRID + i;
          if (s.burn[c] > 0) {
            n++;
            sx += i;
            sz += j;
          }
        }
      }
      inc.burning = n;
      inc.maxBurning = Math.max(inc.maxBurning, n);
      if (n === 0) {
        inc.active = false;
        sim.emit({
          type: 'fire_contained',
          category: 'fire',
          severity: 1,
          title: inc.maxBurning > 12 ? 'Major fire burnt out / contained' : 'Fire extinguished',
          detail: `Peak extent ${(inc.maxBurning * CELL * CELL / 1e4).toFixed(1)} ha.`,
          x: inc.x,
          z: inc.z,
          causes: [inc.eventId],
          radius: 400,
        });
        continue;
      }
      const c = Math.round(sz / n) * GRID + Math.round(sx / n);
      // Merge with another active incident that the fire has grown into.
      for (const other of s.incidents) {
        if (other === inc || !other.active) continue;
        const dd = Math.max(Math.abs((other.cell % GRID) - (c % GRID)), Math.abs(((other.cell / GRID) | 0) - ((c / GRID) | 0)));
        if (dd <= 8 && other.id > inc.id) {
          other.active = false;
          inc.crews += other.crews;
          inc.majorReported = inc.majorReported || other.majorReported;
          inc.maxBurning = Math.max(inc.maxBurning, other.maxBurning);
          for (let k = 0; k < cr.count; k++) if (cr.incident[k] === other.id) cr.incident[k] = inc.id;
        }
      }
      inc.cell = c;
      const p = sim.cellCenter(c);
      inc.x = p.x;
      inc.z = p.z;
      if (!inc.majorReported && n >= 14) {
        inc.majorReported = true;
        const causes = [inc.eventId];
        if (s.waterOk < 1 && s.waterEvent >= 0) causes.push(s.waterEvent);
        const blocked = inc.blockedEvent;
        if (blocked >= 0) causes.push(blocked);
        if (!s.commOk && s.commEvent >= 0) causes.push(s.commEvent);
        const ev = sim.emit({
          type: 'fire_major',
          category: 'fire',
          severity: 3,
          title: `Major fire: ${(n * CELL * CELL / 1e4).toFixed(1)} ha burning`,
          detail: `Wind ${s.eff.windSpeed.toFixed(0)} m/s is driving spread${s.waterOk < 1 ? '; hydrants have no pressure' : ''}${blocked >= 0 ? '; engines could not reach the fire' : ''}.`,
          x: inc.x,
          z: inc.z,
          causes,
          radius: 700,
        });
        if (sim.scenario.resilience.autoEvacuation) sim.issueEvacuation(inc.x, inc.z, 500, [ev], 'Evacuation order: fire zone');
      }
    }
    autoEvacuation(sim);
  }

  // ---- dispatch
  for (const inc of s.incidents) {
    if (!inc.active || s.tick < inc.detectTick) continue;
    const desired = Math.min(3, 1 + Math.floor(inc.burning / 6));
    if (inc.crews >= desired) continue;
    if (s.tick % 5 !== inc.id % 5) continue; // stagger expensive searches
    const target = sim.d.cellNode[inc.cell];
    const dist = sim.tmpDist;
    dijkstra(g, [target], s.eClosed, sim.tmpHop, dist, null, sim.heap, s.brDS);
    let best = -1;
    let bestD = Infinity;
    let idle = 0;
    for (let k = 0; k < cr.count; k++) {
      if (cr.state[k] !== 0 && cr.state[k] !== 3 && cr.state[k] !== 4) continue;
      if (s.aOperational[cr.station[k]] === 0) continue;
      idle++;
      const dd = dist[cr.node[k]];
      if (dd < bestD) {
        bestD = dd;
        best = k;
      }
    }
    if (best >= 0 && bestD < Infinity) {
      cr.state[best] = 1;
      cr.incident[best] = inc.id;
      cr.targetNode[best] = target;
      cr.nextHop.set(sim.tmpHop.subarray(0, N), best * N);
      cr.edge[best] = -1;
      inc.crews++;
      sim.emit({
        type: 'crew_dispatched',
        category: 'fire',
        severity: 0,
        title: `Engine dispatched from ${sim.city.assets[cr.station[best]].name.split('—')[0].trim()}`,
        detail: `ETA ≈ ${Math.max(1, Math.round(bestD / 60))} min over open roads${s.tick - inc.detectTick > 60 ? ' (delayed)' : ''}.`,
        x: inc.x,
        z: inc.z,
        causes: [inc.eventId],
        radius: 600,
      });
    } else if (inc.blockedEvent < 0) {
      const causes: number[] = [];
      if (idle > 0) {
        for (let e = 0; e < g.edgeCount && causes.length < 5; e++) {
          if (!s.eClosed[e]) continue;
          const dx = sim.d.edgeMid[e * 2] - inc.x;
          const dz = sim.d.edgeMid[e * 2 + 1] - inc.z;
          if (dx * dx + dz * dz < 900 * 900 && s.eClosedEvent[e] >= 0 && !causes.includes(s.eClosedEvent[e])) causes.push(s.eClosedEvent[e]);
        }
        for (const br of sim.city.bridges) if (s.brDS[br.id] >= 3 && causes.length < 6) causes.push(s.brEvent[br.id]);
      }
      const ev = sim.emit({
        type: 'crew_blocked',
        category: 'fire',
        severity: 2,
        title: idle > 0 ? 'Fire crews cannot reach a fire' : 'All engine companies committed',
        detail: idle > 0 ? 'Every available engine is cut off by closed roads or collapsed bridges.' : 'The fire burns unattended until a crew frees up.',
        x: inc.x,
        z: inc.z,
        causes: [inc.eventId, ...causes],
        radius: 700,
      });
      inc.blockedEvent = ev;
    }
  }

  // ---- crew movement & suppression
  for (let k = 0; k < cr.count; k++) {
    const st = cr.state[k];
    if (st === 0 || st === 4) continue;
    if (st === 1 || st === 3) {
      moveCrew(sim, k, dt);
      continue;
    }
    // fighting
    const c = sim.cellAt(cr.x[k], cr.z[k]);
    const ci = c % GRID;
    const cj = (c / GRID) | 0;
    let found = false;
    for (let dj = -2; dj <= 2; dj++) {
      for (let di = -2; di <= 2; di++) {
        const i = ci + di;
        const j = cj + dj;
        if (i < 0 || j < 0 || i >= GRID || j >= GRID) continue;
        const n = j * GRID + i;
        if (s.burn[n] > 0) {
          found = true;
          s.burn[n] = Math.max(0, s.burn[n] - SUPPRESS * dt * waterFactor);
          s.heat[n] *= 0.8;
        } else if (s.heat[n] > 0) s.heat[n] *= 0.9;
      }
    }
    if (found) continue;
    // relocate to the nearest burning cell within 10 cells, else return to station
    let best = -1;
    let bd = Infinity;
    for (let dj = -10; dj <= 10; dj++) {
      for (let di = -10; di <= 10; di++) {
        const i = ci + di;
        const j = cj + dj;
        if (i < 0 || j < 0 || i >= GRID || j >= GRID) continue;
        const n = j * GRID + i;
        if (s.burn[n] > 0 && di * di + dj * dj < bd) {
          bd = di * di + dj * dj;
          best = n;
        }
      }
    }
    const inc = s.incidents.find((x) => x.id === cr.incident[k]);
    if (best >= 0) {
      planCrew(sim, k, sim.d.cellNode[best], 1);
    } else {
      if (inc) inc.crews = Math.max(0, inc.crews - 1);
      cr.incident[k] = -1;
      planCrew(sim, k, sim.city.assets[cr.station[k]].node, 3);
    }
  }
}

function planCrew(sim: Simulation, k: number, target: number, state: number) {
  const s = sim.s;
  const g = sim.city.roads;
  const N = g.nodeCount;
  const cr = s.crews;
  cr.targetNode[k] = target;
  cr.state[k] = state;
  dijkstra(g, [target], s.eClosed, cr.nextHop, sim.tmpDist, null, sim.heap, s.brDS, k * N);
  if (cr.node[k] !== target && sim.tmpDist[cr.node[k]] === Infinity) cr.state[k] = 4; // blocked where it stands
}

function moveCrew(sim: Simulation, k: number, dt: number) {
  const s = sim.s;
  const g = sim.city.roads;
  const N = g.nodeCount;
  const cr = s.crews;
  let budget = CREW_SPEED * dt;
  for (let it = 0; it < 8 && budget > 0; it++) {
    if (cr.edge[k] < 0) {
      const n = cr.node[k];
      if (n === cr.targetNode[k]) {
        if (cr.state[k] === 3) cr.state[k] = 0;
        else cr.state[k] = 2;
        return;
      }
      const e = cr.nextHop[k * N + n];
      if (e < 0 || s.eClosed[e]) {
        // route invalidated by a new closure: re-plan once per tick
        planCrew(sim, k, cr.targetNode[k], cr.state[k] === 3 ? 3 : 1);
        return;
      }
      cr.edge[k] = e;
      cr.fwd[k] = g.edgeA[e] === n ? 1 : 0;
      cr.prog[k] = 0;
    }
    const e = cr.edge[k];
    const L = g.edgeLen[e];
    const occ = s.agents.count ? sim.eOcc[e] / g.edgeCap[e] : 0;
    const f = Math.sqrt(1 / (1 + 0.8 * occ * occ));
    const step = budget * f;
    const rem = L - cr.prog[k];
    if (step >= rem) {
      budget -= rem / f;
      cr.node[k] = cr.fwd[k] ? g.edgeB[e] : g.edgeA[e];
      cr.edge[k] = -1;
      cr.prog[k] = 0;
    } else {
      cr.prog[k] += step;
      budget = 0;
    }
  }
  positionCrew(sim, k);
}

export function positionCrew(sim: Simulation, k: number) {
  const g = sim.city.roads;
  const cr = sim.s.crews;
  const e = cr.edge[k];
  if (e < 0) {
    cr.x[k] = g.nodeX[cr.node[k]];
    cr.z[k] = g.nodeZ[cr.node[k]];
    return;
  }
  const a = cr.fwd[k] ? g.edgeA[e] : g.edgeB[e];
  const b = cr.fwd[k] ? g.edgeB[e] : g.edgeA[e];
  const t = g.edgeLen[e] > 0 ? cr.prog[k] / g.edgeLen[e] : 0;
  cr.x[k] = g.nodeX[a] + (g.nodeX[b] - g.nodeX[a]) * t;
  cr.z[k] = g.nodeZ[a] + (g.nodeZ[b] - g.nodeZ[a]) * t;
}

function autoEvacuation(sim: Simulation) {
  const s = sim.s;
  if (!sim.scenario.resilience.autoEvacuation) return;
  const city = sim.city;
  for (let d = 0; d < city.districts.length; d++) {
    if (!s.dFlooded[d] || s.dEvacuated[d]) continue;
    s.dEvacuated[d] = 1;
    const dd = city.districts[d];
    sim.issueEvacuation(dd.cx, dd.cz, Math.sqrt(dd.cells) * CELL * 0.8, [s.dFloodEvent[d]], `Evacuation order: ${dd.name}`);
  }
}

/** Pre-emptive evacuation of the polder when a storm's forecast surge threatens the seawall. */
export function stormForecastEvacuation(sim: Simulation, category: number, stormEvent: number) {
  const s = sim.s;
  if (!sim.scenario.resilience.autoEvacuation) return;
  const peak = s.env.seaLevel + TIDE_AMPLITUDE + stormParams(category).surgePeak;
  let minCrest = Infinity;
  for (const seg of sim.city.levees) {
    for (const c of seg.cells) minCrest = Math.min(minCrest, sim.city.terrain[c] - s.settlement[c] + s.levee[c]);
  }
  if (peak > minCrest - 0.9 && !s.dEvacuated[5]) {
    s.dEvacuated[5] = 1;
    const dd = sim.city.districts[5];
    sim.issueEvacuation(dd.cx, dd.cz, Math.sqrt(dd.cells) * CELL * 0.85, [stormEvent], `Pre-emptive evacuation: ${dd.name} (forecast surge ${peak.toFixed(1)} m vs crest ${minCrest.toFixed(1)} m)`);
  }
}
