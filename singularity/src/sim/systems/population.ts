import { METRIC_INTERVAL, PEOPLE_PER_AGENT, STEP_SECONDS } from '../config';
import { pickWeighted } from '../derived';
import { hashUnit } from '../math';
import type { Simulation } from '../engine';
import { AgentState, type AgentsState, BType } from '../types';
import { MASK_FOOT, MASK_VEHICLE } from './routing';

/**
 * Citizen agents. Each agent stands for PEOPLE_PER_AGENT residents and has a home and a
 * workplace. Movement happens on the road graph: long trips follow precomputed zone
 * routing tables, the final approach is greedy; evacuees and injured follow
 * multi-source shortest-path tables towards open shelters / operational hospitals.
 * Speeds drop with edge occupancy (congestion).
 */

const SPEED_TRAVEL = 8.5;
const SPEED_EVAC = 5; // mixed walking / slow traffic under emergency conditions
const SPEED_INJURED = 4;
const INJURY_THRESHOLDS = [3, 10, 25, 50, 100, 200, 400, 800, 1600];

export function createAgents(sim: Simulation, n: number): AgentsState {
  const A: AgentsState = {
    count: n,
    x: new Float32Array(n),
    z: new Float32Array(n),
    node: new Int32Array(n),
    edge: new Int32Array(n).fill(-1),
    prog: new Float32Array(n),
    fwd: new Uint8Array(n),
    state: new Uint8Array(n),
    health: new Float32Array(n).fill(1),
    home: new Int32Array(n),
    work: new Int32Array(n),
    destNode: new Int32Array(n),
    destBuilding: new Int32Array(n).fill(-1),
    at: new Int32Array(n).fill(-1),
    dwell: new Float32Array(n),
    alerted: new Uint8Array(n),
    affected: new Uint8Array(n),
    stuck: new Uint16Array(n),
    target: new Int16Array(n).fill(-1),
    prevNode: new Int32Array(n).fill(-1),
  };
  const d = sim.d;
  const b = sim.city.buildings;
  const rng = sim.rng.pop;
  const hour = sim.scenario.startHour;
  const inRange = (h: number, a: number, z: number) => h >= a && h < z;
  const pTravel = inRange(hour, 7, 9.5) || inRange(hour, 16.5, 19.5) ? 0.16 : inRange(hour, 9.5, 22) ? 0.07 : 0.02;
  const pWork = inRange(hour, 8.5, 17) ? 0.5 : inRange(hour, 7, 8.5) || inRange(hour, 17, 19.5) ? 0.22 : 0.04;
  const pLeisure = inRange(hour, 11, 22.5) ? 0.12 : 0.02;
  for (let a = 0; a < n; a++) {
    const home = d.homes[pickWeighted(d.homeCum, rng.next())];
    const work = d.works[pickWeighted(d.workCum, rng.next())];
    A.home[a] = home;
    A.work[a] = work;
    const r = rng.next();
    if (r < pTravel) {
      const fromWork = hour >= 12;
      const origin = fromWork ? work : home;
      const dest = fromWork ? home : work;
      A.state[a] = AgentState.Traveling;
      A.node[a] = b.node[origin];
      A.destBuilding[a] = dest;
      A.destNode[a] = b.node[dest];
      A.x[a] = sim.city.roads.nodeX[A.node[a]];
      A.z[a] = sim.city.roads.nodeZ[A.node[a]];
    } else {
      let at = home;
      if (r < pTravel + pWork) at = work;
      else if (r < pTravel + pWork + pLeisure) at = d.leisure[rng.int(d.leisure.length)];
      A.state[a] = AgentState.Inside;
      A.at[a] = at;
      A.node[a] = b.node[at];
      A.x[a] = b.x[at];
      A.z[a] = b.z[at];
      A.dwell[a] = dwellTime(sim, at === home, rng.next()) * rng.next();
    }
  }
  return A;
}

function dwellTime(sim: Simulation, home: boolean, u: number): number {
  const mean = home ? 3.2 * 3600 : 1.6 * 3600;
  void sim;
  return -Math.log(Math.max(1e-6, 1 - u)) * mean + 300;
}

function leaveBuilding(sim: Simulation, a: number) {
  const A = sim.s.agents;
  const at = A.at[a];
  if (at < 0) return;
  A.node[a] = sim.city.buildings.node[at];
  A.at[a] = -1;
  A.edge[a] = -1;
  A.prevNode[a] = -1;
  A.x[a] = sim.city.roads.nodeX[A.node[a]];
  A.z[a] = sim.city.roads.nodeZ[A.node[a]];
}

function startEvacuation(sim: Simulation, a: number) {
  const A = sim.s.agents;
  leaveBuilding(sim, a);
  A.state[a] = AgentState.Evacuating;
  A.alerted[a] = 1;
  A.stuck[a] = 0;
}

function becomeInjured(sim: Simulation, a: number, cause: number) {
  const s = sim.s;
  const A = s.agents;
  leaveBuilding(sim, a);
  A.state[a] = AgentState.Injured;
  A.affected[a] = 1;
  if (cause >= 0) s.injuredCauses[cause] = (s.injuredCauses[cause] ?? 0) + 1;
}

function startTrip(sim: Simulation, a: number) {
  const s = sim.s;
  const A = s.agents;
  const d = sim.d;
  const b = sim.city.buildings;
  const at = A.at[a];
  const hour = s.eff.timeOfDay;
  const u = hashUnit(sim.scenario.seed, a, s.tick, 11);
  let dest: number;
  if (at !== A.home[a]) dest = A.home[a];
  else if (hour >= 6.5 && hour < 10) dest = A.work[a];
  else if (hour >= 10 && hour < 21.5 && u < 0.45) dest = d.leisure[Math.floor(hashUnit(sim.scenario.seed, a, s.tick, 12) * d.leisure.length)];
  else {
    A.dwell[a] = dwellTime(sim, true, u);
    return;
  }
  if (dest === at) {
    A.dwell[a] = dwellTime(sim, true, u);
    return;
  }
  leaveBuilding(sim, a);
  A.state[a] = AgentState.Traveling;
  A.destBuilding[a] = dest;
  A.destNode[a] = b.node[dest];
  A.stuck[a] = 0;
}

function chooseEdge(sim: Simulation, a: number, n: number): number {
  const s = sim.s;
  const A = s.agents;
  const g = sim.city.roads;
  const st = A.state[a];
  if (st === AgentState.Evacuating) return s.shelterHop[n];
  if (st === AgentState.ToHospital) return s.hospitalHop[n];
  const dest = A.destNode[a];
  const dz = g.nodeZone[dest];
  if (g.nodeZone[n] !== dz) {
    const e = s.zoneHop[dz * g.nodeCount + n];
    if (e >= 0) return e;
  }
  // Greedy final approach.
  const tx = g.nodeX[dest];
  const tz = g.nodeZ[dest];
  let best = -1;
  let bestD = Infinity;
  let fallback = -1;
  for (let k = g.adjStart[n]; k < g.adjStart[n + 1]; k++) {
    const e = g.adjEdge[k];
    if (s.eClosed[e]) continue;
    const m = g.adjNode[k];
    if (m === A.prevNode[a]) {
      fallback = e;
      continue;
    }
    const dd = (g.nodeX[m] - tx) ** 2 + (g.nodeZ[m] - tz) ** 2 + hashUnit(a, n, m, s.tick >> 6) * 900;
    if (dd < bestD) {
      bestD = dd;
      best = e;
    }
  }
  return best >= 0 ? best : fallback;
}

function arrive(sim: Simulation, a: number, n: number): boolean {
  const s = sim.s;
  const A = s.agents;
  const st = A.state[a];
  const b = sim.city.buildings;
  if (st === AgentState.Traveling) {
    if (n !== A.destNode[a]) return false;
    const dest = A.destBuilding[a];
    if (dest >= 0 && s.bDS[dest] >= 3) {
      // home or workplace unusable: seek shelter instead
      startEvacuation(sim, a);
      return true;
    }
    A.state[a] = AgentState.Inside;
    A.at[a] = dest;
    A.x[a] = b.x[dest];
    A.z[a] = b.z[dest];
    A.dwell[a] = dwellTime(sim, dest === A.home[a], hashUnit(sim.scenario.seed, a, s.tick, 13));
    return true;
  }
  if (st === AgentState.Evacuating) {
    if (s.shelterDist[n] !== 0) return false;
    const sh = s.shelterOf[n];
    if (sh < 0) return false;
    const as = sim.city.assets[sh];
    if (s.aLoad[sh] >= as.capacity) {
      if (!(s.aFlag[sh] & 1)) {
        s.aFlag[sh] |= 1;
        sim.emit({
          type: 'shelter_full',
          category: 'population',
          severity: 2,
          title: `${as.name} at capacity`,
          detail: `${as.capacity * PEOPLE_PER_AGENT} evacuees registered; new arrivals are redirected.`,
          x: as.x,
          z: as.z,
          causes: [],
          subject: { kind: 'asset', id: sh },
          radius: 500,
        });
        sim.routingDirty();
      }
      return false;
    }
    s.aLoad[sh]++;
    A.state[a] = AgentState.Sheltered;
    A.target[a] = sh;
    const j1 = hashUnit(a, 1, 2, 3) - 0.5;
    const j2 = hashUnit(a, 3, 2, 1) - 0.5;
    A.x[a] = as.x + j1 * 60;
    A.z[a] = as.z + j2 * 60;
    return true;
  }
  if (st === AgentState.ToHospital) {
    if (s.hospitalDist[n] !== 0) return false;
    const h = s.hospitalOf[n];
    if (h < 0) return false;
    const as = sim.city.assets[h];
    s.aLoad[h]++;
    A.state[a] = AgentState.Hospitalized;
    A.target[a] = h;
    A.x[a] = as.x + (hashUnit(a, 5, 6, 7) - 0.5) * 40;
    A.z[a] = as.z + (hashUnit(a, 7, 6, 5) - 0.5) * 40;
    if (s.aLoad[h] > as.capacity && !(s.aFlag[h] & 2)) {
      s.aFlag[h] |= 2;
      sim.emit({
        type: 'hospital_overload',
        category: 'health',
        severity: 2,
        title: `${as.name} over capacity`,
        detail: `More than ${as.capacity * PEOPLE_PER_AGENT} simulated casualties received.`,
        x: as.x,
        z: as.z,
        causes: topInjuryCauses(sim),
        subject: { kind: 'asset', id: h },
        radius: 500,
      });
    }
    return true;
  }
  return false;
}

function move(sim: Simulation, a: number, dt: number) {
  const s = sim.s;
  const A = s.agents;
  const g = sim.city.roads;
  const st = A.state[a];
  const mask = st === AgentState.Traveling ? MASK_VEHICLE : MASK_FOOT;
  let budget = (st === AgentState.ToHospital ? SPEED_INJURED : st === AgentState.Evacuating ? SPEED_EVAC : SPEED_TRAVEL) * dt;
  for (let it = 0; it < 6 && budget > 0; it++) {
    if (A.edge[a] < 0) {
      const n = A.node[a];
      if (arrive(sim, a, n)) return;
      const e = chooseEdge(sim, a, n);
      if (e < 0 || s.eClosed[e] & mask) {
        A.stuck[a] = Math.min(65000, A.stuck[a] + 1);
        if (A.stuck[a] > 450 && st === AgentState.Traveling) {
          // give up and head home (or shelter if home is unusable)
          const home = A.home[a];
          if (A.destBuilding[a] === home) startEvacuation(sim, a);
          else {
            A.destBuilding[a] = home;
            A.destNode[a] = sim.city.buildings.node[home];
          }
          A.stuck[a] = 0;
        }
        break;
      }
      A.stuck[a] = 0;
      A.prevNode[a] = n;
      A.edge[a] = e;
      A.fwd[a] = g.edgeA[e] === n ? 1 : 0;
      A.prog[a] = 0;
    }
    const e = A.edge[a];
    const L = g.edgeLen[e];
    if (s.eClosed[e] & mask && A.prog[a] < L * 0.5) {
      // turn back
      A.fwd[a] ^= 1;
      A.prog[a] = L - A.prog[a];
    }
    const occ = sim.eOcc[e] / g.edgeCap[e];
    const f = Math.max(0.06, 1 / (1 + 0.8 * occ * occ));
    const step = budget * f;
    const rem = L - A.prog[a];
    if (step >= rem) {
      budget -= rem / f;
      A.node[a] = A.fwd[a] ? g.edgeB[e] : g.edgeA[e];
      A.edge[a] = -1;
      A.prog[a] = 0;
    } else {
      A.prog[a] += step;
      budget = 0;
    }
  }
  const e = A.edge[a];
  if (e < 0) {
    A.x[a] = g.nodeX[A.node[a]];
    A.z[a] = g.nodeZ[A.node[a]];
  } else {
    const na = A.fwd[a] ? g.edgeA[e] : g.edgeB[e];
    const nb = A.fwd[a] ? g.edgeB[e] : g.edgeA[e];
    const t = A.prog[a] / Math.max(1, g.edgeLen[e]);
    A.x[a] = g.nodeX[na] + (g.nodeX[nb] - g.nodeX[na]) * t;
    A.z[a] = g.nodeZ[na] + (g.nodeZ[nb] - g.nodeZ[na]) * t;
  }
}

export function computeOccupancy(sim: Simulation) {
  const s = sim.s;
  const occ = sim.eOcc;
  occ.fill(0);
  const A = s.agents;
  for (let a = 0; a < A.count; a++) {
    const e = A.edge[a];
    if (e >= 0) occ[e]++;
  }
  const cr = s.crews;
  for (let k = 0; k < cr.count; k++) if (cr.edge[k] >= 0) occ[cr.edge[k]] += 2;
}

export function updatePopulation(sim: Simulation) {
  const s = sim.s;
  const A = s.agents;
  const dt = STEP_SECONDS;
  const seed = sim.scenario.seed;
  const b = sim.city.buildings;

  // Occupants of buildings whose damage state rose this tick.
  if (sim.dsChanged.length) {
    for (let a = 0; a < A.count; a++) {
      const at = A.at[a];
      if (at < 0 || !sim.dsChangedFlag[at]) continue;
      const ds = s.bDS[at];
      const cause = sim.dsChangedCause[at];
      const u = hashUnit(seed, a, s.tick, 9);
      if (ds >= 2) A.affected[a] = 1;
      if (ds >= 4) {
        if (u < 0.35) {
          leaveBuilding(sim, a);
          A.state[a] = AgentState.Trapped;
          A.dwell[a] = 1200 + hashUnit(seed, a, s.tick, 10) * 4200;
          if (cause >= 0) s.injuredCauses[cause] = (s.injuredCauses[cause] ?? 0) + 1;
        } else if (u < 0.65) becomeInjured(sim, a, cause);
        else startEvacuation(sim, a);
      } else if (ds === 3) {
        if (u < 0.08) becomeInjured(sim, a, cause);
        else startEvacuation(sim, a);
      }
    }
  }

  const orders = s.evacOrders;
  const commOk = s.commOk;
  for (let a = 0; a < A.count; a++) {
    const st = A.state[a];
    if (st === AgentState.Sheltered || st === AgentState.Hospitalized) continue;
    const c = sim.cellAt(A.x[a], A.z[a]);
    // Water under bridges / in the river is not floodwater for people on the deck.
    const depth = sim.d.landMask[c] && sim.city.road[c] !== 3 ? s.water[c] : 0;
    const brn = s.burn[c];
    const smoke = s.smoke[c];
    const shake = sim.shaking[c];
    // "affected" = exposed to damaging intensity (≈ MMI VIII shaking, wading-depth water,
    // fire or dense smoke) or displaced/injured; merely feeling the quake does not count
    if (depth > 0.1 || brn > 0.05 || smoke > 0.6 || shake > 0.3) A.affected[a] = 1;
    let dmg = 0;
    let cause = -1;
    const at = A.at[a];
    if (depth > 0.45) {
      const sheltered = at >= 0 && b.floors[at] > 2 ? 0.15 : 1;
      dmg += 0.0009 * Math.min(depth, 3) * dt * sheltered;
      cause = sim.floodCauses(c)[0] ?? -1;
    }
    if (brn > 0.2) {
      dmg += (at >= 0 ? 0.0035 : 0.002) * brn * dt;
      cause = sim.incidentEventAt(c);
    }
    if (smoke > 1.5) dmg += 0.00003 * smoke * dt;
    if (dmg > 0) {
      A.health[a] = Math.max(0, A.health[a] - dmg);
      if (A.health[a] < 0.5 && st !== AgentState.Injured && st !== AgentState.ToHospital && st !== AgentState.Trapped) {
        becomeInjured(sim, a, cause);
        continue;
      }
    }
    // Imminent hazard: leave now.
    if ((st === AgentState.Inside || st === AgentState.Traveling) && (depth > 0.25 || brn > 0.1 || (at >= 0 && s.burn[b.cell[at]] > 0.05))) {
      startEvacuation(sim, a);
      continue;
    }
    // Evacuation orders: immediate alert with mobile coverage, word of mouth otherwise.
    if (!A.alerted[a] && (st === AgentState.Inside || st === AgentState.Traveling) && orders.length) {
      for (let k = 0; k < orders.length; k++) {
        const o = orders[k];
        const dx = A.x[a] - o.x;
        const dz = A.z[a] - o.z;
        if (dx * dx + dz * dz > o.radius * o.radius) continue;
        const heard = (commOk && sim.commCover[c]) || hashUnit(seed, a, s.tick, 21) < 0.0035;
        if (heard) {
          startEvacuation(sim, a);
          break;
        }
      }
      if (A.state[a] === AgentState.Evacuating) continue;
    }
    switch (A.state[a]) {
      case AgentState.Inside:
        A.dwell[a] -= dt;
        if (A.dwell[a] <= 0) startTrip(sim, a);
        break;
      case AgentState.Traveling:
      case AgentState.Evacuating:
      case AgentState.ToHospital:
        move(sim, a, dt);
        break;
      case AgentState.Injured: {
        const n = A.node[a];
        if (s.hospitalDist[n] < Infinity && A.edge[a] < 0) A.state[a] = AgentState.ToHospital;
        break;
      }
      case AgentState.Trapped:
        A.dwell[a] -= dt;
        if (A.dwell[a] <= 0) A.state[a] = AgentState.Injured;
        break;
    }
  }

  // Aggregate casualty milestones into events.
  if (s.tick % METRIC_INTERVAL === 0) {
    let injured = 0;
    for (let a = 0; a < A.count; a++) {
      const st = A.state[a];
      if (st === AgentState.Injured || st === AgentState.ToHospital || st === AgentState.Hospitalized || st === AgentState.Trapped) injured++;
    }
    const next = INJURY_THRESHOLDS.find((t) => t > s.injuredReported);
    if (next !== undefined && injured >= next) {
      s.injuredReported = injured;
      sim.emit({
        type: 'casualties',
        category: 'health',
        severity: injured >= 50 ? 3 : 2,
        title: `${(injured * PEOPLE_PER_AGENT).toLocaleString('en-US')} residents injured (simulated)`,
        detail: `Aggregated from ${injured} agents (1 agent = ${PEOPLE_PER_AGENT} people). Main causes listed below.`,
        x: sim.city.districts[3].cx,
        z: sim.city.districts[3].cz,
        causes: topInjuryCauses(sim),
        radius: 2500,
      });
    }
  }
}

function topInjuryCauses(sim: Simulation): number[] {
  return Object.entries(sim.s.injuredCauses)
    .sort((a, b) => b[1] - a[1] || Number(a[0]) - Number(b[0]))
    .slice(0, 4)
    .map(([k]) => Number(k));
}

export const isHomeType = (t: number) => t === BType.House || t === BType.Apartment;
