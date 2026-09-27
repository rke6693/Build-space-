import { CELL, GRID, METRIC_INTERVAL, MAX_SIM_TICKS, N_CELLS, STEP_SECONDS, WX_GRID, cellX, cellZ } from './config';
import { generateCity } from './city/generate';
import { type Derived, cellOfXZ, deriveStatic } from './derived';
import { EventLog, type EventSpec } from './events';
import { hashUnit, sanitizeArray } from './math';
import { accumulateBusinessInterruption, computeMetrics } from './metrics';
import { Noise } from './noise';
import { Rng } from './rng';
import { cloneScenario, minutesToTicks } from './scenario';
import { DS_NAMES, DS_RATIO, startQuake, updateEarthquakes } from './systems/earthquake';
import { registerIgnition, stormForecastEvacuation, trackSpreadIgnitions, updateEmergency } from './systems/emergency';
import { updateFire } from './systems/fire';
import { breachLevee, makeFloodWork, spinUpWater, updateFlood } from './systems/flood';
import { updateInfrastructure } from './systems/infrastructure';
import { computeOccupancy, createAgents, updatePopulation } from './systems/population';
import { Heap, updateRoads, updateRouting } from './systems/routing';
import { stormParams, tideAt, updateWeather, windVector } from './systems/weather';
import {
  type AssetKind,
  BType,
  type City,
  type Command,
  type CommandSpec,
  type CrewsState,
  type EventCategory,
  type EventType,
  type Metrics,
  type Scenario,
  type SimState,
  ZONE_NAMES,
} from './types';

export interface Snapshot {
  tick: number;
  state: PackedState;
}

type PackedField = { sparse: true; len: number; idx: Uint16Array | Uint32Array; val: Float32Array } | { sparse: false; data: Float32Array };
export type PackedState = Record<string, unknown>;

const IGNITION_TYPE_FACTOR: Record<number, number> = {
  [BType.House]: 1.2,
  [BType.Apartment]: 1.0,
  [BType.Office]: 0.55,
  [BType.Tower]: 0.4,
  [BType.Warehouse]: 1.2,
  [BType.Factory]: 2.4,
  [BType.Retail]: 1.0,
};

/**
 * Deterministic fixed-timestep simulation. All randomness comes from seeded streams stored
 * in the state (or from stateless hashes of seed + ids), so identical scenario + commands
 * reproduce bit-identical state on the same JavaScript engine.
 */
export class Simulation {
  readonly city: City;
  readonly d: Derived;
  readonly scenario: Scenario;
  readonly noise: Noise;
  readonly maxTicks: number;
  s: SimState;
  log = new EventLog();
  rng!: { quake: Rng; fire: Rng; pop: Rng; weather: Rng; infra: Rng };
  commands: Command[] = [];
  private cmdIdx = 0;

  // ---- derived runtime buffers (never part of snapshots; recomputed from state) ----
  shaking = new Float32Array(N_CELLS);
  shakingActive = true;
  bPowered: Uint8Array;
  commCover = new Uint8Array(N_CELLS);
  floodWork = makeFloodWork();
  pumpDemand: Float64Array;
  pumpScale: Float64Array;
  pumpedVolume: Float64Array;
  smokeTmp = new Float32Array(N_CELLS);
  smokeMean = 0;
  fireNewIgnitions: number[] = [];
  fireActiveCells = 0;
  dsChanged: number[] = [];
  dsChangedFlag: Uint8Array;
  dsChangedCause: Int32Array;
  tmpEnergized: Uint8Array;
  tmpDist: Float32Array;
  tmpHop: Int16Array;
  tmpQueue: Int32Array;
  tmpComp: Int32Array;
  heap: Heap;
  eOcc: Uint16Array;
  closureCount: Int32Array;
  closureCauses: number[][];
  pendingEdgeSlot: Int32Array;
  perf = { lastStepMs: 0, avgStepMs: 0 };

  constructor(scenario: Scenario, city?: City) {
    this.scenario = cloneScenario(scenario);
    this.city = city && city.seed === scenario.seed ? city : generateCity(scenario.seed);
    this.d = deriveStatic(this.city);
    this.noise = new Noise((scenario.seed ^ 0x5bd1e995) >>> 0);
    this.maxTicks = Math.min(MAX_SIM_TICKS, minutesToTicks(this.scenario.durationMin));
    const nA = this.city.assets.length;
    const nN = this.city.roads.nodeCount;
    const nE = this.city.roads.edgeCount;
    const nD = this.city.districts.length;
    this.bPowered = new Uint8Array(this.city.buildings.count).fill(1);
    this.dsChangedFlag = new Uint8Array(this.city.buildings.count);
    this.dsChangedCause = new Int32Array(this.city.buildings.count).fill(-1);
    this.pumpDemand = new Float64Array(nA);
    this.pumpScale = new Float64Array(nA);
    this.pumpedVolume = new Float64Array(nA);
    this.tmpEnergized = new Uint8Array(nA);
    this.tmpDist = new Float32Array(nN);
    this.tmpHop = new Int16Array(nN);
    this.tmpQueue = new Int32Array(nN);
    this.tmpComp = new Int32Array(nN);
    this.heap = new Heap(nE * 2 + nN + 16);
    this.eOcc = new Uint16Array(nE);
    this.closureCount = new Int32Array(nD * 4);
    this.closureCauses = Array.from({ length: nD * 4 }, () => [] as number[]);
    this.pendingEdgeSlot = new Int32Array(nE).fill(-1);

    this.s = this.createState();
    this.commands = this.scenario.commands.map((c) => ({ ...c, spec: { ...c.spec } as CommandSpec })).sort((a, b) => a.tick - b.tick || a.id - b.id);
    this.city.population = this.s.agents.count * 100;

    // Initial equilibrium: weather, sea & river levels, grid, routing.
    updateWeather(this);
    spinUpWater(this, 600);
    updateInfrastructure(this);
    updateRouting(this, true);
    this.recomputeCommCover();
    computeOccupancy(this);
  }

  get tick(): number {
    return this.s.tick;
  }

  get events() {
    return this.log.events;
  }

  // ------------------------------------------------------------------ state
  private createState(): SimState {
    const city = this.city;
    const d = this.d;
    const sc = this.scenario;
    const seed = sc.seed;
    const nA = city.assets.length;
    const nN = city.roads.nodeCount;
    const nE = city.roads.edgeCount;
    const nD = city.districts.length;
    const nB = city.buildings.count;
    this.rng = {
      quake: Rng.stream(seed, 'quake'),
      fire: Rng.stream(seed, 'fire'),
      pop: Rng.stream(seed, 'pop'),
      weather: Rng.stream(seed, 'weather'),
      infra: Rng.stream(seed, 'infra'),
    };
    const env = { ...sc.env };
    const [wx, wz] = windVector(env.windDir);
    const levee = new Float32Array(N_CELLS);
    for (let c = 0; c < N_CELLS; c++) if (city.leveeHeight[c] > 0) levee[c] = Math.max(0, city.leveeHeight[c] + sc.resilience.leveeRaise);
    const aBackup = new Float32Array(nA);
    for (const a of city.assets) aBackup[a.id] = a.backupHours * sc.resilience.backupHoursScale * 3600;

    const s: SimState = {
      tick: 0,
      rng: { quake: this.rng.quake.s, fire: this.rng.fire.s, pop: this.rng.pop.s, weather: this.rng.weather.s, infra: this.rng.infra.s },
      env,
      eff: {
        ...env,
        surge: 0,
        tide: tideAt(0),
        seaSurface: env.seaLevel + tideAt(0),
        riverQ: 70,
        visibilityKm: 20,
        stormIntensity: 0,
        lightningRate: 0,
        cloudCover: 0,
        windX: wx * env.windSpeed,
        windZ: wz * env.windSpeed,
        gust: env.windSpeed * 1.3,
        timeOfDay: sc.startHour,
      },
      riverQ: 70 + env.rainfall * 3.2,
      cloudOX: 0,
      cloudOZ: 0,
      water: new Float32Array(N_CELLS),
      qx: new Float32Array(N_CELLS),
      qz: new Float32Array(N_CELLS),
      maxWater: new Uint8Array(N_CELLS),
      settlement: new Float32Array(N_CELLS),
      levee,
      burn: new Float32Array(N_CELLS),
      heat: new Float32Array(N_CELLS),
      fuel: d.fuelLoad.slice(),
      burned: new Uint8Array(N_CELLS),
      smoke: new Float32Array(N_CELLS),
      peakPGA: new Float32Array(N_CELLS),
      clouds: new Float32Array(WX_GRID * WX_GRID),
      wetness: new Float32Array(WX_GRID * WX_GRID).fill(Math.min(1, env.soilSaturation * 0.5 + Math.min(0.5, env.rainfall / 20))),
      bDamage: new Float32Array(nB),
      bDS: new Uint8Array(nB),
      bDSStart: new Uint8Array(nB),
      bFire: new Float32Array(nB),
      bPeak: new Float32Array(nB),
      episode: -1,
      episodeEvent: -1,
      aPeak: new Float32Array(nA),
      brPeak: new Float32Array(city.bridges.length),
      lPeak: new Float32Array(city.lines.length),
      aDS: new Uint8Array(nA),
      aEnergized: new Uint8Array(nA).fill(1),
      aOnBackup: new Uint8Array(nA),
      aBackup,
      aOperational: new Uint8Array(nA).fill(2),
      aFlooded: new Uint8Array(nA),
      aAccessible: new Uint8Array(nA).fill(1),
      aTrip: new Float32Array(nA),
      aEvent: new Int32Array(nA).fill(-1),
      aDamageEvent: new Int32Array(nA).fill(-1),
      aFloodEvent: new Int32Array(nA).fill(-1),
      aTripEvent: new Int32Array(nA).fill(-1),
      aBackupEvent: new Int32Array(nA).fill(-1),
      aLoad: new Int32Array(nA),
      aFlag: new Uint8Array(nA),
      lDamaged: new Uint8Array(city.lines.length),
      lEvent: new Int32Array(city.lines.length).fill(-1),
      brDS: new Uint8Array(city.bridges.length),
      brEvent: new Int32Array(city.bridges.length).fill(-1),
      lsState: new Uint8Array(city.levees.length),
      lsSettled: new Float32Array(city.levees.length),
      lsEvent: new Int32Array(city.levees.length).fill(-1),
      eClosed: new Uint8Array(nE),
      eDebris: new Uint8Array(nE),
      eClosedEvent: new Int32Array(nE).fill(-1),
      routingDirty: 1,
      routingVersion: 0,
      zoneHop: new Int16Array(city.roads.zoneCount * nN).fill(-1),
      shelterHop: new Int16Array(nN).fill(-1),
      shelterDist: new Float32Array(nN),
      shelterOf: new Int16Array(nN).fill(-1),
      hospitalHop: new Int16Array(nN).fill(-1),
      hospitalDist: new Float32Array(nN),
      hospitalOf: new Int16Array(nN).fill(-1),
      mainReach: new Uint8Array(nN).fill(1),
      agents: undefined as unknown as SimState['agents'],
      crews: this.createCrews(),
      incidents: [],
      nextIncidentId: 0,
      quakes: [],
      nextQuakeId: 1,
      storms: [],
      pulses: [],
      strikes: [],
      evacOrders: [],
      dFloodEvent: new Int32Array(nD).fill(-1),
      dFlooded: new Uint8Array(nD),
      dEvacuated: new Uint8Array(nD),
      dLiqEvent: new Int32Array(nD).fill(-1),
      dCollapseEvent: new Int32Array(nD).fill(-1),
      dClosureTick: new Int32Array(nD * 4).fill(-100000),
      dClosureEvent: new Int32Array(nD * 4).fill(-1),
      commEvent: -1,
      waterEvent: -1,
      commOk: 1,
      waterOk: 1,
      nextEventId: 0,
      lossBusiness: 0,
      windPeak: 0,
      windDamagePending: 0,
      injuredReported: 0,
      injuredCauses: {},
      repairedNaN: 0,
    };
    this.s = s;
    s.agents = createAgents(this, sc.agents);
    return s;
  }

  private createCrews(): CrewsState {
    const city = this.city;
    const stations = this.d.assetsByKind.fire;
    const per = this.scenario.resilience.crewsPerStation;
    const n = stations.length * per;
    const nN = city.roads.nodeCount;
    const cr: CrewsState = {
      count: n,
      station: new Int16Array(n),
      state: new Uint8Array(n),
      node: new Int32Array(n),
      edge: new Int32Array(n).fill(-1),
      prog: new Float32Array(n),
      fwd: new Uint8Array(n),
      x: new Float32Array(n),
      z: new Float32Array(n),
      incident: new Int16Array(n).fill(-1),
      targetNode: new Int32Array(n).fill(-1),
      nextHop: new Int16Array(n * nN).fill(-1),
      blockedEvent: new Int32Array(n).fill(-1),
    };
    for (let k = 0; k < n; k++) {
      const st = city.assets[stations[Math.floor(k / per)]];
      cr.station[k] = st.id;
      cr.node[k] = st.node;
      cr.x[k] = city.roads.nodeX[st.node];
      cr.z[k] = city.roads.nodeZ[st.node];
    }
    return cr;
  }

  private bindRng() {
    this.rng = {
      quake: new Rng(this.s.rng.quake),
      fire: new Rng(this.s.rng.fire),
      pop: new Rng(this.s.rng.pop),
      weather: new Rng(this.s.rng.weather),
      infra: new Rng(this.s.rng.infra),
    };
  }

  // ------------------------------------------------------------------ stepping
  step(): boolean {
    const s = this.s;
    if (s.tick >= this.maxTicks) return false;
    const t0 = typeof performance !== 'undefined' ? performance.now() : 0;
    for (const b of this.dsChanged) {
      this.dsChangedFlag[b] = 0;
      this.dsChangedCause[b] = -1;
    }
    this.dsChanged.length = 0;

    this.applyDueCommands();
    updateWeather(this);
    updateEarthquakes(this);
    updateInfrastructure(this);
    updateFlood(this);
    if (s.tick % METRIC_INTERVAL === 0) this.updateDistrictHazards();
    updateFire(this);
    trackSpreadIgnitions(this);
    updateRoads(this);
    updateRouting(this);
    computeOccupancy(this);
    updateEmergency(this);
    updatePopulation(this);
    if (s.tick % METRIC_INTERVAL === 0) accumulateBusinessInterruption(this);
    if (s.tick % 30 === 0) this.guardNumerics();
    s.tick++;

    if (t0) {
      const ms = performance.now() - t0;
      this.perf.lastStepMs = ms;
      this.perf.avgStepMs = this.perf.avgStepMs * 0.95 + ms * 0.05;
    }
    return true;
  }

  metrics(): Metrics {
    return computeMetrics(this);
  }

  // ------------------------------------------------------------------ commands
  addCommand(cmd: Command) {
    if (cmd.tick < this.s.tick) throw new Error(`Command tick ${cmd.tick} is in the past (now ${this.s.tick})`);
    this.commands.push(cmd);
    this.commands.sort((a, b) => a.tick - b.tick || a.id - b.id);
    this.syncCommandIndex();
  }

  setCommands(cmds: Command[]) {
    this.commands = cmds.map((c) => ({ ...c })).sort((a, b) => a.tick - b.tick || a.id - b.id);
    this.syncCommandIndex();
  }

  private syncCommandIndex() {
    let k = 0;
    while (k < this.commands.length && this.commands[k].tick < this.s.tick) k++;
    this.cmdIdx = k;
  }

  private applyDueCommands() {
    const s = this.s;
    while (this.cmdIdx < this.commands.length && this.commands[this.cmdIdx].tick <= s.tick) {
      const c = this.commands[this.cmdIdx++];
      if (c.tick === s.tick) this.applyCommand(c);
    }
  }

  private applyCommand(cmd: Command) {
    const s = this.s;
    const spec = cmd.spec;
    const tag = cmd.source === 'interactive' ? ' (operator)' : '';
    switch (spec.kind) {
      case 'earthquake':
        startQuake(this, spec, false, -1);
        break;
      case 'rain': {
        const ev = this.emit({ type: 'rain', category: 'weather', severity: spec.rate >= 40 ? 2 : 1, title: `Extreme rainfall: ${spec.rate.toFixed(0)} mm/h${tag}`, detail: `Cloudburst lasting ${spec.durationMin.toFixed(0)} min over the city.`, x: 0, z: -600, radius: 3000 });
        s.pulses.push({ kind: 'rain', eventId: ev, startTick: s.tick, duration: spec.durationMin * 60, peak: spec.rate });
        break;
      }
      case 'surge': {
        const ev = this.emit({ type: 'storm_surge', category: 'flood', severity: 2, title: `Storm surge +${spec.height.toFixed(1)} m${tag}`, detail: `Sea level anomaly lasting ${spec.durationMin.toFixed(0)} min, on top of the tide.`, x: 900, z: 1200, radius: 2600 });
        s.pulses.push({ kind: 'surge', eventId: ev, startTick: s.tick, duration: spec.durationMin * 60, peak: spec.height });
        break;
      }
      case 'levee_breach':
        breachLevee(this, spec.segment, spec.width, []);
        break;
      case 'river_flood': {
        const ev = this.emit({ type: 'river_flood', category: 'flood', severity: 2, title: `River flood wave ${spec.peak.toFixed(0)} m³/s${tag}`, detail: 'Upstream discharge rises well above the channel’s normal flow.', x: this.city.districts[2].cx, z: -1800, radius: 2200 });
        s.pulses.push({ kind: 'river', eventId: ev, startTick: s.tick, duration: spec.durationMin * 60, peak: spec.peak });
        break;
      }
      case 'fire': {
        const c0 = cellOfXZ(spec.x, spec.z);
        const ev = this.emit({ type: 'fire_ignition', category: 'fire', severity: 2, title: `Fire started${tag}`, detail: `Ignition in ${this.describeCell(c0)}.`, x: spec.x, z: spec.z, radius: 500, subject: { kind: 'cell', id: c0 } });
        const i0 = c0 % GRID;
        const j0 = (c0 / GRID) | 0;
        for (let dj = -spec.radius; dj <= spec.radius; dj++) {
          for (let di = -spec.radius; di <= spec.radius; di++) {
            const i = i0 + di;
            const j = j0 + dj;
            if (i < 0 || j < 0 || i >= GRID || j >= GRID) continue;
            const c = j * GRID + i;
            if (s.fuel[c] > 0.05 && !s.burned[c]) {
              s.burn[c] = Math.max(s.burn[c], 0.4);
              s.heat[c] = 0;
            }
          }
        }
        registerIgnition(this, c0, ev);
        break;
      }
      case 'storm': {
        const p = stormParams(spec.category);
        const ev = this.emit({
          type: 'storm',
          category: 'weather',
          severity: spec.category >= 3 ? 3 : 2,
          title: `${spec.category === 0 ? 'Tropical storm' : `Category ${spec.category} storm`} arriving${tag}`,
          detail: `Peak: rain ${p.rainPeak.toFixed(0)} mm/h, wind ${p.windPeak.toFixed(0)} m/s, surge ${p.surgePeak.toFixed(1)} m over ${spec.durationMin.toFixed(0)} min.`,
          x: 0,
          z: 1600,
          radius: 3500,
        });
        s.storms.push({ eventId: ev, startTick: s.tick, duration: spec.durationMin * 60, category: spec.category, dirDeg: spec.dirDeg, rainPeak: p.rainPeak, windPeak: p.windPeak, surgePeak: p.surgePeak, lightning: spec.lightning ? 1 : 0 });
        stormForecastEvacuation(this, spec.category, ev);
        break;
      }
      case 'asset': {
        const a = this.city.assets[spec.assetId];
        if (!a) break;
        if (spec.action === 'damage') this.setAssetDS(a.id, 3, -1);
        else if (spec.action === 'trip') {
          s.aTrip[a.id] = 600;
          s.aTripEvent[a.id] = this.emit({ type: 'power_loss', category: 'power', severity: 2, title: `${a.name} tripped${tag}`, detail: 'Protective relays opened for 10 minutes.', x: a.x, z: a.z, subject: { kind: 'asset', id: a.id }, radius: 600 });
        } else {
          s.aDS[a.id] = 0;
          s.aTrip[a.id] = 0;
          s.aBackup[a.id] = a.backupHours * this.scenario.resilience.backupHoursScale * 3600;
          this.emit({ type: 'power_restored', category: 'power', severity: 1, title: `${a.name} restored${tag}`, detail: 'Repaired and returned to service.', x: a.x, z: a.z, subject: { kind: 'asset', id: a.id }, radius: 600 });
        }
        break;
      }
      case 'line': {
        const l = this.city.lines[spec.lineId];
        if (!l) break;
        if (spec.action === 'damage') {
          s.lDamaged[l.id] = 1;
          s.lEvent[l.id] = this.emit({ type: 'line_failure', category: 'power', severity: 2, title: `${l.name} failed${tag}`, detail: 'Conductor down.', x: (l.points[0] + l.points[l.points.length - 2]) / 2, z: (l.points[1] + l.points[l.points.length - 1]) / 2, subject: { kind: 'line', id: l.id }, radius: 900 });
        } else s.lDamaged[l.id] = 0;
        break;
      }
      case 'evacuate':
        this.issueEvacuation(spec.x, spec.z, spec.radius, [], `Evacuation order${tag}`);
        break;
      case 'env': {
        const parts: string[] = [];
        for (const [k, v] of Object.entries(spec.env)) {
          if (typeof v !== 'number' || !Number.isFinite(v)) continue;
          (s.env as unknown as Record<string, number>)[k] = v;
          parts.push(`${k} → ${v.toFixed(1)}`);
        }
        this.emit({ type: 'env_change', category: 'weather', severity: 0, title: `Conditions changed${tag}`, detail: parts.join(', '), x: 0, z: 0, radius: 3000 });
        break;
      }
    }
  }

  // ------------------------------------------------------------------ cascade hooks used by systems
  emit(spec: EventSpec): number {
    return this.log.emit(this.s, spec);
  }

  routingDirty() {
    this.s.routingDirty = 1;
  }

  cellAt(x: number, z: number): number {
    return cellOfXZ(x, z);
  }

  cellCenter(c: number): { x: number; z: number } {
    return { x: cellX(c % GRID), z: cellZ((c / GRID) | 0) };
  }

  describeCell(c: number): string {
    const d = this.city.district[c];
    return `${ZONE_NAMES[this.city.zone[c]].toLowerCase()} block${d >= 0 ? ` in ${this.city.districts[d].name}` : ''}`;
  }

  setBuildingDS(b: number, ds: number, cause: number, byFire = false) {
    const s = this.s;
    const prev = s.bDS[b];
    if (ds <= prev) return;
    s.bDS[b] = ds;
    s.bDamage[b] = Math.max(s.bDamage[b], DS_RATIO[ds]);
    if (!this.dsChangedFlag[b]) {
      this.dsChangedFlag[b] = 1;
      this.dsChanged.push(b);
    }
    this.dsChangedCause[b] = cause;
    const bl = this.city.buildings;
    if (ds >= 4) {
      // Debris from collapse blocks adjacent streets.
      const c = bl.cell[b];
      const r = bl.h[b] > 60 ? 2 : 1;
      const i0 = c % GRID;
      const j0 = (c / GRID) | 0;
      for (let dj = -r; dj <= r; dj++) {
        for (let di = -r; di <= r; di++) {
          const i = i0 + di;
          const j = j0 + dj;
          if (i < 0 || j < 0 || i >= GRID || j >= GRID) continue;
          const e = this.city.roadEdge[j * GRID + i];
          if (e >= 0 && !s.eDebris[e] && this.city.roads.edgeKind[e] !== 3) {
            s.eDebris[e] = 1;
            if (s.eClosedEvent[e] < 0) s.eClosedEvent[e] = cause;
          }
        }
      }
    }
    if (!byFire && ds >= 2 && prev < 2) {
      // Gas-line ruptures / electrical faults in damaged buildings.
      const p = [0, 0, 0.0018, 0.011, 0.034][ds] * (IGNITION_TYPE_FACTOR[bl.type[b]] ?? 0.4) * (bl.sclass[b] === 1 ? 1.3 : 1) * (1 + Math.max(0, s.env.temperature - 18) * 0.03);
      if (hashUnit(this.scenario.seed, b, s.episode, 5) < p) this.ignite(bl.cell[b], cause, `Gas line rupture ignites a ${ds >= 4 ? 'collapsed' : 'damaged'} building`, 2);
    }
    if (bl.asset[b] >= 0 && byFire) this.setAssetDS(bl.asset[b], ds, cause);
  }

  setAssetDS(id: number, ds: number, cause: number, pga?: number, medians?: number[]) {
    const s = this.s;
    const prev = s.aDS[id];
    if (ds <= prev) return;
    s.aDS[id] = ds;
    const a = this.city.assets[id];
    if (a.building >= 0 && s.bDS[a.building] < ds) {
      s.bDS[a.building] = ds;
      s.bDamage[a.building] = Math.max(s.bDamage[a.building], DS_RATIO[ds]);
    }
    if (ds < 2) return;
    const map: Record<AssetKind, [EventType, EventCategory]> = {
      plant: ['substation_damage', 'power'],
      import: ['substation_damage', 'power'],
      tx: ['substation_damage', 'power'],
      sub: ['substation_damage', 'power'],
      pump: ['critical_damage', 'flood'],
      water: ['critical_damage', 'water'],
      hospital: ['critical_damage', 'health'],
      fire: ['critical_damage', 'fire'],
      shelter: ['critical_damage', 'population'],
      hub: ['critical_damage', 'comms'],
      tower: ['critical_damage', 'comms'],
      eoc: ['critical_damage', 'population'],
    };
    const [type, category] = map[a.kind];
    const grid = a.kind === 'sub' || a.kind === 'tx' || a.kind === 'plant' || a.kind === 'import';
    const detail =
      pga !== undefined && medians
        ? `Site PGA ${pga.toFixed(2)} g vs ${DS_NAMES[ds].toLowerCase()}-damage median ${medians[ds - 1].toFixed(2)} g (lognormal β ${a.beta}). ${ds >= 3 ? 'Out of service.' : grid ? 'Protective trip; equipment inspection required.' : 'Operating in degraded mode.'}`
        : cause < 0
          ? 'Failure injected by scenario/operator command.'
          : ds >= 3
            ? 'Out of service.'
            : 'Degraded.';
    s.aDamageEvent[id] = this.emit({
      type,
      category,
      severity: ds >= 3 ? (a.kind === 'tower' ? 2 : 3) : a.kind === 'tower' ? 1 : 2,
      title: ds >= 3 ? `${a.name} ${a.kind === 'hospital' || a.kind === 'shelter' ? 'structurally unusable' : 'knocked out'}` : `${a.name} damaged`,
      detail,
      x: a.x,
      z: a.z,
      causes: cause >= 0 ? [cause] : [],
      subject: { kind: 'asset', id },
      radius: 600,
    });
    if (ds === 2 && grid) {
      s.aTrip[id] = Math.max(s.aTrip[id], 900);
      s.aTripEvent[id] = s.aDamageEvent[id];
    }
  }

  ignite(c: number, cause: number, reason: string, severity: 0 | 1 | 2 | 3): number {
    const s = this.s;
    if (s.fuel[c] < 0.05 || s.burned[c] || s.water[c] > 0.2) return -1;
    s.burn[c] = Math.max(s.burn[c], 0.25);
    s.heat[c] = 0;
    const p = this.cellCenter(c);
    const ev = this.emit({ type: 'fire_ignition', category: 'fire', severity, title: reason, detail: `Fire in ${this.describeCell(c)}.`, x: p.x, z: p.z, causes: cause >= 0 ? [cause] : [], subject: { kind: 'cell', id: c }, radius: 450 });
    registerIgnition(this, c, ev);
    return ev;
  }

  incidentEventAt(c: number): number {
    const ci = c % GRID;
    const cj = (c / GRID) | 0;
    let best = -1;
    let bd = 12;
    for (const inc of this.s.incidents) {
      if (!inc.active) continue;
      const dd = Math.max(Math.abs((inc.cell % GRID) - ci), Math.abs(((inc.cell / GRID) | 0) - cj));
      if (dd <= bd) {
        bd = dd;
        best = inc.eventId;
      }
    }
    return best;
  }

  issueEvacuation(x: number, z: number, radius: number, causes: number[], title: string) {
    const s = this.s;
    const ev = this.emit({
      type: 'evac_order',
      category: 'population',
      severity: 2,
      title,
      detail: `Residents within ${(radius / 1000).toFixed(1)} km are directed to open shelters. Alerts reach phones where a cell tower works; elsewhere news spreads by word of mouth.`,
      x,
      z,
      causes,
      radius: radius * 1.3,
    });
    s.evacOrders.push({ eventId: ev, x, z, radius, tick: s.tick });
    if (s.evacOrders.length > 40) s.evacOrders.shift();
  }

  /** Drivers of flooding at a cell: district flood event, or failed pumps / levees / rain. */
  floodCauses(c: number): number[] {
    const s = this.s;
    const d = c >= 0 ? this.city.district[c] : -1;
    if (d >= 0 && s.dFloodEvent[d] >= 0 && s.dFlooded[d]) return [s.dFloodEvent[d]];
    return this.floodDrivers(d);
  }

  floodDrivers(d: number): number[] {
    const s = this.s;
    const out: number[] = [];
    for (const pid of this.d.assetsByKind.pump) if (s.aOperational[pid] === 0 && (d < 0 || this.city.assets[pid].district === d) && s.aEvent[pid] >= 0) out.push(s.aEvent[pid]);
    for (const seg of this.city.levees) if (s.lsState[seg.id] > 0 && s.lsEvent[seg.id] >= 0 && (d < 0 || d === 5)) out.push(s.lsEvent[seg.id]);
    for (const p of s.pulses) out.push(p.eventId);
    for (const st of s.storms) out.push(st.eventId);
    return out.slice(0, 6);
  }

  private updateDistrictHazards() {
    const s = this.s;
    const city = this.city;
    const nd = city.districts.length;
    const cnt = new Int32Array(nd);
    const land = new Int32Array(nd);
    const maxD = new Float32Array(nd);
    for (let c = 0; c < N_CELLS; c++) {
      const d = city.district[c];
      if (d < 0 || city.ocean[c] || city.zone[c] === 1) continue;
      land[d]++;
      const w = s.water[c];
      if (w > 0.3) {
        cnt[d]++;
        if (w > maxD[d]) maxD[d] = w;
      }
    }
    for (let d = 0; d < nd; d++) {
      const frac = land[d] ? cnt[d] / land[d] : 0;
      const dd = city.districts[d];
      if (!s.dFlooded[d] && cnt[d] >= 10 && frac > 0.04) {
        s.dFlooded[d] = 1;
        s.dFloodEvent[d] = this.emit({
          type: 'flood_zone',
          category: 'flood',
          severity: frac > 0.15 ? 3 : 2,
          title: `Flooding in ${dd.name}`,
          detail: `${((cnt[d] * CELL * CELL) / 1e6).toFixed(2)} km² under > 30 cm of water (${(frac * 100).toFixed(0)} % of the district), up to ${maxD[d].toFixed(2)} m deep.`,
          x: dd.cx,
          z: dd.cz,
          causes: this.floodDrivers(d),
          subject: { kind: 'district', id: d },
          radius: Math.sqrt(dd.cells) * CELL * 0.9,
        });
      } else if (s.dFlooded[d] && frac < 0.015) {
        s.dFlooded[d] = 0;
        this.emit({ type: 'flood_receding', category: 'flood', severity: 1, title: `Flood water receding in ${dd.name}`, detail: 'Less than 1.5 % of the district remains under 30 cm of water.', x: dd.cx, z: dd.cz, causes: [s.dFloodEvent[d]], subject: { kind: 'district', id: d }, radius: 900 });
      }
    }
  }

  recomputeCommCover() {
    const s = this.s;
    const towers = this.d.assetsByKind.tower.filter((id) => s.aOperational[id] > 0).map((id) => this.city.assets[id]);
    const R2 = 1400 * 1400;
    for (let j = 0; j < GRID; j++) {
      const z = cellZ(j);
      for (let i = 0; i < GRID; i++) {
        const x = cellX(i);
        let cov = 0;
        for (const t of towers) {
          if ((t.x - x) ** 2 + (t.z - z) ** 2 < R2) {
            cov = 1;
            break;
          }
        }
        this.commCover[j * GRID + i] = cov;
      }
    }
  }

  buildingsServedBy(sub: number): number {
    const b = this.city.buildings;
    let n = 0;
    for (let k = 0; k < b.count; k++) if (b.substation[k] === sub) n++;
    return n;
  }

  private guardNumerics() {
    const s = this.s;
    let r = 0;
    r += sanitizeArray(s.water, 0, 250);
    r += sanitizeArray(s.qx, -2000, 2000);
    r += sanitizeArray(s.qz, -2000, 2000);
    r += sanitizeArray(s.burn, 0, 1);
    r += sanitizeArray(s.heat, 0, 100);
    r += sanitizeArray(s.fuel, 0, 2);
    r += sanitizeArray(s.smoke, 0, 8);
    r += sanitizeArray(s.settlement, 0, 5);
    r += sanitizeArray(s.levee, 0, 30);
    r += sanitizeArray(s.peakPGA, 0, 5);
    r += sanitizeArray(s.agents.health, 0, 1);
    if (!Number.isFinite(s.riverQ)) {
      s.riverQ = 70;
      r++;
    }
    if (!Number.isFinite(s.cloudOX) || !Number.isFinite(s.cloudOZ)) {
      s.cloudOX = 0;
      s.cloudOZ = 0;
      r++;
    }
    s.repairedNaN += r;
  }

  // ------------------------------------------------------------------ snapshots
  snapshot(): Snapshot {
    return { tick: this.s.tick, state: packState(this.s) };
  }

  restore(snap: Snapshot) {
    this.s = unpackState(snap.state) as unknown as SimState;
    this.log.truncate(this.s.nextEventId);
    this.bindRng();
    this.syncCommandIndex();
    this.refreshDerived();
  }

  /** Recompute every runtime buffer that is a pure function of the state. */
  refreshDerived() {
    const s = this.s;
    this.shaking.fill(0);
    this.shakingActive = true;
    for (const b of this.dsChanged) {
      this.dsChangedFlag[b] = 0;
      this.dsChangedCause[b] = -1;
    }
    this.dsChanged.length = 0;
    this.fireNewIgnitions.length = 0;
    this.pendingEdgeSlot.fill(-1);
    const bl = this.city.buildings;
    for (let k = 0; k < bl.count; k++) this.bPowered[k] = s.aEnergized[bl.substation[k]] && s.bDS[k] < 4 ? 1 : 0;
    let total = 0;
    for (let c = 0; c < N_CELLS; c++) total += s.smoke[c];
    this.smokeMean = total / N_CELLS;
    this.recomputeCommCover();
    computeOccupancy(this);
  }

  checksum(): number {
    return hashValue(this.s as unknown as Record<string, unknown>, 0x811c9dc5);
  }
}

// ------------------------------------------------------------------ packing & hashing

function packF32(v: Float32Array): PackedField {
  let nz = 0;
  for (let k = 0; k < v.length; k++) if (v[k] !== 0) nz++;
  if (nz * 2 < v.length) {
    const idx = v.length <= 65535 ? new Uint16Array(nz) : new Uint32Array(nz);
    const val = new Float32Array(nz);
    let p = 0;
    for (let k = 0; k < v.length; k++) {
      if (v[k] !== 0) {
        idx[p] = k;
        val[p++] = v[k];
      }
    }
    return { sparse: true, len: v.length, idx, val };
  }
  return { sparse: false, data: v.slice() };
}

function unpackF32(p: PackedField): Float32Array {
  if (!p.sparse) return p.data.slice();
  const out = new Float32Array(p.len);
  for (let k = 0; k < p.idx.length; k++) out[p.idx[k]] = p.val[k];
  return out;
}

const PACK_TAG = '__f32pack';

export function packState(s: SimState): PackedState {
  const out: PackedState = {};
  for (const [k, v] of Object.entries(s)) {
    if (v instanceof Float32Array && v.length >= 1024) out[k] = { [PACK_TAG]: packF32(v) };
    else out[k] = structuredClone(v);
  }
  return out;
}

export function unpackState(p: PackedState): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(p)) {
    if (v && typeof v === 'object' && PACK_TAG in (v as Record<string, unknown>)) out[k] = unpackF32((v as Record<string, PackedField>)[PACK_TAG]);
    else out[k] = structuredClone(v);
  }
  return out;
}

export function packedBytes(p: PackedState): number {
  let n = 0;
  const walk = (v: unknown) => {
    if (ArrayBuffer.isView(v)) n += v.byteLength;
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') Object.values(v).forEach(walk);
    else n += 8;
  };
  walk(p);
  return n;
}

const f64 = new Float64Array(1);
const u32 = new Uint32Array(f64.buffer);

function mix(h: number, x: number): number {
  h ^= x;
  return Math.imul(h, 0x01000193) >>> 0;
}

/** FNV-1a style structural hash of the full state (typed arrays hashed byte-wise). */
export function hashValue(v: unknown, h: number): number {
  if (v === null || v === undefined) return mix(h, 0x9e);
  if (typeof v === 'number') {
    f64[0] = v;
    return mix(mix(h, u32[0]), u32[1]);
  }
  if (typeof v === 'boolean') return mix(h, v ? 1 : 2);
  if (typeof v === 'string') {
    for (let k = 0; k < v.length; k++) h = mix(h, v.charCodeAt(k));
    return h;
  }
  if (ArrayBuffer.isView(v)) {
    const bytes = new Uint8Array(v.buffer, v.byteOffset, v.byteLength);
    // hash 4 bytes at a time for speed when aligned
    if (bytes.byteOffset % 4 === 0 && bytes.byteLength % 4 === 0) {
      const w = new Uint32Array(v.buffer, v.byteOffset, v.byteLength / 4);
      for (let k = 0; k < w.length; k++) h = mix(h, w[k]);
    } else for (let k = 0; k < bytes.length; k++) h = mix(h, bytes[k]);
    return mix(h, bytes.length);
  }
  if (Array.isArray(v)) {
    for (const x of v) h = hashValue(x, h);
    return mix(h, v.length);
  }
  if (typeof v === 'object') {
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
      h = hashValue(k, h);
      h = hashValue(x, h);
    }
    return h;
  }
  return h;
}

export { STEP_SECONDS };
