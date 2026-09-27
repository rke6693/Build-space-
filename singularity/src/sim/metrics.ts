import { CELL_AREA, METRIC_INTERVAL, N_CELLS, PEOPLE_PER_AGENT, STEP_SECONDS } from './config';
import type { Simulation } from './engine';
import { DS_RATIO } from './systems/earthquake';
import { AgentState, BType, type Metrics } from './types';

/**
 * Illustrative economic model (explicitly NOT an actuarial estimate):
 *  - structure loss = replacement value x max(damage-state ratio, fire damage)
 *  - contents loss  = structure value x contents ratio x max(depth-damage(max flood depth), fire damage)
 *  - infrastructure = repair cost x damage ratio (+30 % of equipment value if flooded)
 *  - business interruption accrues per hour for commercial buildings that are
 *    unpowered, flooded or damaged (fraction of value per hour, configurable)
 * All terms are scaled by the scenario's economic settings.
 */
export function depthDamage(depth: number): number {
  if (depth <= 0.05) return 0;
  return Math.min(0.75, 1 - Math.exp(-depth / 1.3));
}

const COMMERCIAL = new Set<number>([BType.Office, BType.Tower, BType.Retail, BType.Warehouse, BType.Factory]);

export function accumulateBusinessInterruption(sim: Simulation) {
  const s = sim.s;
  const b = sim.city.buildings;
  const econ = sim.scenario.economics;
  const hours = (METRIC_INTERVAL * STEP_SECONDS) / 3600;
  let loss = 0;
  for (let k = 0; k < b.count; k++) {
    if (!COMMERCIAL.has(b.type[k])) continue;
    const down = !sim.bPowered[k] || s.bDS[k] >= 2 || s.water[b.cell[k]] > 0.3 || s.bFire[k] > 0.1;
    if (down) loss += b.value[k];
  }
  s.lossBusiness += loss * econ.businessInterruptionPerHour * hours * econ.costScale;
}

export function computeMetrics(sim: Simulation): Metrics {
  const s = sim.s;
  const city = sim.city;
  const b = city.buildings;
  const econ = sim.scenario.economics;
  const eff = s.eff;

  // population
  const A = s.agents;
  let affected = 0;
  let evacuating = 0;
  let stranded = 0;
  let sheltered = 0;
  let injured = 0;
  let hospitalized = 0;
  let trapped = 0;
  let withHospital = 0;
  for (let a = 0; a < A.count; a++) {
    const st = A.state[a];
    if (A.affected[a]) affected++;
    if (st === AgentState.Evacuating) {
      evacuating++;
      if (A.edge[a] < 0 && s.shelterDist[A.node[a]] === Infinity) stranded++;
    }
    else if (st === AgentState.Sheltered) sheltered++;
    else if (st === AgentState.Injured || st === AgentState.ToHospital) injured++;
    else if (st === AgentState.Hospitalized) hospitalized++;
    else if (st === AgentState.Trapped) trapped++;
    const node = A.at[a] >= 0 ? b.node[A.at[a]] : A.node[a];
    if (s.hospitalDist[node] < 1800) withHospital++;
  }

  // buildings
  const ds = [0, 0, 0, 0, 0];
  let burning = 0;
  let flooded = 0;
  let powered = 0;
  let lossB = 0;
  let lossC = 0;
  for (let k = 0; k < b.count; k++) {
    ds[s.bDS[k]]++;
    const c = b.cell[k];
    if (s.burn[c] > 0.05) burning++;
    const depth = s.water[c];
    if (depth > 0.15) flooded++;
    if (sim.bPowered[k]) powered++;
    const v = b.value[k] * econ.costScale;
    const fr = s.bFire[k];
    lossB += v * Math.max(DS_RATIO[s.bDS[k]], fr);
    lossC += v * econ.contentsRatio * Math.max(depthDamage(s.maxWater[c] / 20), fr);
  }

  // infrastructure
  let subsOn = 0;
  const subs = sim.d.assetsByKind.sub;
  for (const id of subs) if (s.aEnergized[id]) subsOn++;
  let lossI = 0;
  for (const a of city.assets) {
    lossI += a.repairCost * DS_RATIO[s.aDS[a.id]];
    if (s.aFlooded[a.id]) lossI += a.repairCost * 0.3;
  }
  for (const br of city.bridges) lossI += br.repairCost * DS_RATIO[s.brDS[br.id]];
  for (const l of city.lines) if (s.lDamaged[l.id]) lossI += 3.5e6;
  for (const seg of city.levees) if (s.lsState[seg.id] === 2) lossI += 45e6;
  lossI *= econ.infraCostScale;

  // roads
  const g = city.roads;
  let open = 0;
  let total = 0;
  let closed = 0;
  for (let e = 0; e < g.edgeCount; e++) {
    total += g.edgeLen[e];
    if (!s.eClosed[e]) open += g.edgeLen[e];
    else closed++;
  }
  let bridgesOpen = 0;
  for (const br of city.bridges) if (s.brDS[br.id] < 3) bridgesOpen++;

  // hazards on the grid
  let floodCells = 0;
  let maxDepth = 0;
  let vol = 0;
  let fires = 0;
  let burned = 0;
  let peak = 0;
  const land = sim.d.landMask;
  for (let c = 0; c < N_CELLS; c++) {
    if (s.burn[c] > 0) fires++;
    if (s.burned[c]) burned++;
    if (s.peakPGA[c] > peak) peak = s.peakPGA[c];
    if (!land[c] || city.ocean[c]) continue;
    const w = s.water[c];
    if (w > 0.15) {
      floodCells++;
      vol += w * CELL_AREA;
      if (w > maxDepth) maxDepth = w;
    }
  }

  let hospOp = 0;
  let hospAcc = 0;
  const hosp = sim.d.assetsByKind.hospital;
  for (const id of hosp) {
    if (s.aOperational[id] > 0) hospOp++;
    if (s.aOperational[id] > 0 && s.aAccessible[id]) hospAcc++;
  }
  let towersUp = 0;
  const towers = sim.d.assetsByKind.tower;
  for (const id of towers) if (s.aOperational[id] > 0) towersUp++;
  let pumpsOn = 0;
  const pumps = sim.d.assetsByKind.pump;
  for (const id of pumps) if (s.aOperational[id] > 0) pumpsOn++;

  const P = PEOPLE_PER_AGENT;
  const lossBus = s.lossBusiness;
  return {
    tick: s.tick,
    t: s.tick * STEP_SECONDS,
    population: A.count * P,
    affected: affected * P,
    evacuating: evacuating * P,
    stranded: stranded * P,
    evacuated: sheltered * P,
    sheltered: sheltered * P,
    injured: (injured + hospitalized + trapped) * P,
    hospitalized: hospitalized * P,
    trapped: trapped * P,
    bNone: ds[0],
    bSlight: ds[1],
    bModerate: ds[2],
    bExtensive: ds[3],
    bCollapsed: ds[4],
    bBurning: burning,
    bFlooded: flooded,
    gridAvailability: b.count ? powered / b.count : 1,
    substationsOnline: subsOn,
    substationsTotal: subs.length,
    roadAccessibility: total ? open / total : 1,
    roadsClosed: closed,
    bridgesOpen,
    bridgesTotal: city.bridges.length,
    floodedAreaKm2: (floodCells * CELL_AREA) / 1e6,
    maxFloodDepth: maxDepth,
    floodVolume: vol,
    activeFires: fires,
    burnedAreaKm2: ((burned + fires) * CELL_AREA) / 1e6,
    fireIncidents: s.incidents.filter((i) => i.active).length,
    hospitalsOperational: hospOp,
    hospitalsAccessible: hospAcc,
    hospitalsTotal: hosp.length,
    hospitalAccess: A.count ? withHospital / A.count : 1,
    commAvailability: towers.length ? (s.commOk ? towersUp / towers.length : 0) : 1,
    waterAvailability: s.waterOk,
    pumpsOnline: pumpsOn,
    pumpsTotal: pumps.length,
    lossBuildings: lossB,
    lossContents: lossC,
    lossInfrastructure: lossI,
    lossBusiness: lossBus,
    lossTotal: lossB + lossC + lossI + lossBus,
    rain: eff.rainfall,
    wind: eff.windSpeed,
    visibilityKm: eff.visibilityKm,
    seaSurface: eff.seaSurface,
    peakPGA: peak,
  };
}

export const METRIC_KEYS: (keyof Metrics)[] = [
  'tick', 't', 'population', 'affected', 'evacuating', 'stranded', 'evacuated', 'sheltered', 'injured', 'hospitalized', 'trapped',
  'bNone', 'bSlight', 'bModerate', 'bExtensive', 'bCollapsed', 'bBurning', 'bFlooded',
  'gridAvailability', 'substationsOnline', 'substationsTotal', 'roadAccessibility', 'roadsClosed', 'bridgesOpen', 'bridgesTotal',
  'floodedAreaKm2', 'maxFloodDepth', 'floodVolume', 'activeFires', 'burnedAreaKm2', 'fireIncidents',
  'hospitalsOperational', 'hospitalsAccessible', 'hospitalsTotal', 'hospitalAccess', 'commAvailability', 'waterAvailability',
  'pumpsOnline', 'pumpsTotal', 'lossBuildings', 'lossContents', 'lossInfrastructure', 'lossBusiness', 'lossTotal',
  'rain', 'wind', 'visibilityKm', 'seaSurface', 'peakPGA',
];
