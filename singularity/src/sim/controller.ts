import { KEYFRAME_INTERVAL, MAX_KEYFRAMES, METRIC_INTERVAL, STEP_SECONDS } from './config';
import { Simulation, type Snapshot, packedBytes } from './engine';
import { cloneScenario } from './scenario';
import type { ActiveQuakeView, City, Command, CommandSpec, Frame, Metrics, Scenario, SimEvent } from './types';

export interface Keyframe {
  tick: number;
  snap: Snapshot;
  checksum: number;
  bytes: number;
}

export interface ReplayVerification {
  checked: number;
  mismatches: number;
  lastTick: number;
}

/**
 * Owns a Simulation plus its recorded timeline: periodic full-state keyframes, the
 * metrics history and the event log up to the "frontier" (the furthest tick ever
 * simulated on the current branch). Seeking backwards restores the nearest keyframe and
 * deterministically re-simulates to the target; crossing a recorded keyframe while
 * replaying verifies the state checksum. Issuing a command in the past truncates the
 * future (a new branch). Runs identically in a Web Worker or in Node tests.
 */
export class SimController {
  sim: Simulation;
  scenario: Scenario;
  keyframes: Keyframe[] = [];
  keyInterval = KEYFRAME_INTERVAL;
  frontier = 0;
  history: Metrics[] = [];
  recorded: SimEvent[] = [];
  verification: ReplayVerification = { checked: 0, mismatches: 0, lastTick: -1 };
  private nextCommandId: number;
  /** Events appended to `recorded` since the last drain (for incremental UI updates). */
  private eventCursor = 0;
  private historyCursor = 0;
  timelineVersion = 0; // bumps whenever recorded events/history are truncated

  constructor(scenario: Scenario, city?: City) {
    this.scenario = cloneScenario(scenario);
    this.sim = new Simulation(this.scenario, city);
    this.nextCommandId = Math.max(0, ...this.scenario.commands.map((c) => c.id)) + 1;
    this.recordKeyframe();
    this.history.push(this.sim.metrics());
  }

  get tick(): number {
    return this.sim.tick;
  }
  get maxTicks(): number {
    return this.sim.maxTicks;
  }
  get replaying(): boolean {
    return this.sim.tick < this.frontier;
  }
  get commands(): Command[] {
    return this.sim.commands;
  }

  private recordKeyframe() {
    const snap = this.sim.snapshot();
    this.keyframes.push({ tick: snap.tick, snap, checksum: this.sim.checksum(), bytes: packedBytes(snap.state) });
    if (this.keyframes.length > MAX_KEYFRAMES) {
      // Thin out: keep t=0 and every other keyframe, double the interval.
      this.keyframes = this.keyframes.filter((_k, i) => i === 0 || i % 2 === 0);
      this.keyInterval *= 2;
    }
  }

  /** Advance one tick with timeline bookkeeping. Returns false at the end of the scenario. */
  stepOnce(): boolean {
    const sim = this.sim;
    const t = sim.tick;
    if (t >= sim.maxTicks) return false;
    if (t > 0 && t % this.keyInterval === 0) {
      const kf = this.keyframes.find((k) => k.tick === t);
      if (!kf && t >= this.frontier) this.recordKeyframe();
      else if (kf && t < this.frontier) {
        this.verification.checked++;
        this.verification.lastTick = t;
        if (sim.checksum() !== kf.checksum) this.verification.mismatches++;
      }
    }
    sim.step();
    const nt = sim.tick;
    if (nt > this.frontier) {
      this.frontier = nt;
      // new events on the frontier
      const evs = sim.events;
      for (let k = this.recorded.length; k < evs.length; k++) this.recorded.push(evs[k]);
      if (nt % METRIC_INTERVAL === 0) this.history.push(sim.metrics());
    }
    return true;
  }

  /** Step up to `n` ticks or until `budgetMs` elapses; returns ticks executed. */
  advance(n: number, budgetMs = Infinity): number {
    const t0 = typeof performance !== 'undefined' ? performance.now() : 0;
    let done = 0;
    while (done < n) {
      if (!this.stepOnce()) break;
      done++;
      if (budgetMs !== Infinity && performance.now() - t0 > budgetMs) break;
    }
    return done;
  }

  /** Deterministic seek: restore the nearest keyframe at or before `target`, then re-simulate. */
  seek(target: number) {
    target = Math.max(0, Math.min(Math.round(target), this.sim.maxTicks));
    const now = this.sim.tick;
    if (target === now) return;
    if (target < now || target - now > this.keyInterval * 2) {
      let best: Keyframe | undefined;
      for (const k of this.keyframes) if (k.tick <= target && (!best || k.tick > best.tick)) best = k;
      if (best && (target < now || best.tick > now)) this.sim.restore(best.snap);
    }
    while (this.sim.tick < target) if (!this.stepOnce()) break;
  }

  /**
   * Schedule a command. `atTick` defaults to "now". Commands issued while replaying the
   * past create a new branch: the recorded future (keyframes, events, history and
   * interactive commands after this point) is discarded.
   */
  issue(spec: CommandSpec, atTick?: number): Command {
    const now = this.sim.tick;
    const tick = Math.max(now, Math.round(atTick ?? now));
    if (now < this.frontier) this.branchAt(now);
    const cmd: Command = { id: this.nextCommandId++, tick, source: 'interactive', spec };
    this.sim.addCommand(cmd);
    return cmd;
  }

  /** Remove a pending (future) command. Removing one in the recorded past branches the timeline. */
  cancelCommand(id: number): boolean {
    const cmd = this.sim.commands.find((c) => c.id === id);
    if (!cmd || cmd.tick < this.sim.tick) return false;
    if (cmd.tick < this.frontier) this.branchAt(this.sim.tick);
    this.sim.setCommands(this.sim.commands.filter((c) => c.id !== id));
    return true;
  }

  branchAt(t: number) {
    this.keyframes = this.keyframes.filter((k) => k.tick <= t);
    this.recorded.length = Math.min(this.recorded.length, this.sim.s.nextEventId);
    this.history = this.history.filter((m) => m.tick <= t);
    this.sim.setCommands(this.sim.commands.filter((c) => c.source === 'scenario' || c.tick < t));
    this.frontier = t;
    this.eventCursor = Math.min(this.eventCursor, this.recorded.length);
    this.historyCursor = Math.min(this.historyCursor, this.history.length);
    this.timelineVersion++;
  }

  /** Scenario including every command issued so far (for saving / comparison). */
  currentScenario(): Scenario {
    const s = cloneScenario(this.scenario);
    s.commands = this.sim.commands.map((c) => ({ ...c, source: 'scenario' as const, spec: JSON.parse(JSON.stringify(c.spec)) as CommandSpec }));
    return s;
  }

  drainEvents(): { from: number; events: SimEvent[] } {
    const from = this.eventCursor;
    const events = this.recorded.slice(from);
    this.eventCursor = this.recorded.length;
    return { from, events };
  }

  drainHistory(): { from: number; samples: Metrics[] } {
    const from = this.historyCursor;
    const samples = this.history.slice(from);
    this.historyCursor = this.history.length;
    return { from, samples };
  }

  memoryBytes(): number {
    let n = 0;
    for (const k of this.keyframes) n += k.bytes;
    return n + this.recorded.length * 400 + this.history.length * 400;
  }

  /** Copies of the dynamic render state (safe to transfer to another thread). */
  buildFrame(extra: { playing: boolean; speed: number }): Frame {
    const sim = this.sim;
    const s = sim.s;
    const b = sim.city.buildings;
    const bState = new Uint8Array(b.count);
    for (let k = 0; k < b.count; k++) {
      const c = b.cell[k];
      bState[k] = s.bDS[k] | (s.burn[c] > 0.05 ? 8 : 0) | (sim.bPowered[k] ? 16 : 0) | (s.water[c] > 0.15 ? 32 : 0);
    }
    const A = s.agents;
    const agentsXZ = new Float32Array(A.count * 2);
    for (let a = 0; a < A.count; a++) {
      agentsXZ[a * 2] = A.x[a];
      agentsXZ[a * 2 + 1] = A.z[a];
    }
    const cr = s.crews;
    const crewsXZ = new Float32Array(cr.count * 2);
    for (let k = 0; k < cr.count; k++) {
      crewsXZ[k * 2] = cr.x[k];
      crewsXZ[k * 2 + 1] = cr.z[k];
    }
    const t = s.tick * STEP_SECONDS;
    const quakes: ActiveQuakeView[] = s.quakes
      .filter((q) => !q.done)
      .map((q) => ({ id: q.id, x: q.x, z: q.z, depthKm: q.depthKm, magnitude: q.magnitude, elapsed: t - q.startTick * STEP_SECONDS, duration: q.duration, aftershock: q.aftershock }));
    const levees = new Uint8Array(sim.city.levees.length);
    for (let k = 0; k < levees.length; k++) levees[k] = s.lsState[k];
    return {
      tick: s.tick,
      frontier: this.frontier,
      playing: extra.playing,
      speed: extra.speed,
      replay: s.tick < this.frontier,
      eff: { ...s.eff },
      water: s.water.slice(),
      burn: s.burn.slice(),
      burned: s.burned.slice(),
      smoke: s.smoke.slice(),
      shaking: sim.shaking.slice(),
      peakPGA: s.peakPGA.slice(),
      settlement: s.settlement.slice(),
      levee: s.levee.slice(),
      clouds: s.clouds.slice(),
      bState,
      bDamage: s.bDamage.slice(),
      agentsXZ,
      agentsState: A.state.slice(),
      crewsXZ,
      crewsState: cr.state.slice(),
      eClosed: s.eClosed.slice(),
      eOcc: sim.eOcc.slice(),
      assets: sim.city.assets.map((a) => ({
        status: s.aOperational[a.id],
        energized: s.aEnergized[a.id],
        onBackup: s.aOnBackup[a.id],
        backup: s.aBackup[a.id],
        ds: s.aDS[a.id],
        flooded: s.aFlooded[a.id],
        accessible: s.aAccessible[a.id],
        load: s.aLoad[a.id],
      })),
      lines: s.lDamaged.slice(),
      bridges: s.brDS.slice(),
      levees,
      strikes: s.strikes.slice(-12),
      quakes,
      incidents: s.incidents.filter((i) => i.active).map((i) => ({ x: i.x, z: i.z, burning: i.burning, active: i.active })),
      metrics: sim.metrics(),
    };
  }
}

/** Transferable buffers of a frame (for postMessage). */
export function frameTransferables(f: Frame): ArrayBuffer[] {
  const list = [f.water, f.burn, f.burned, f.smoke, f.shaking, f.peakPGA, f.settlement, f.levee, f.clouds, f.bState, f.bDamage, f.agentsXZ, f.agentsState, f.crewsXZ, f.crewsState, f.eClosed, f.eOcc, f.lines, f.bridges, f.levees];
  return list.map((a) => a.buffer as ArrayBuffer);
}

/** Runs a scenario to `horizonTicks` without keyframes, sampling metrics (for comparison mode). */
export function runHeadless(
  scenario: Scenario,
  horizonTicks: number,
  sampleEvery = METRIC_INTERVAL,
  onProgress?: (p: number) => void,
  city?: City,
): { samples: Metrics[]; events: SimEvent[]; final: Metrics; checksum: number; sim: Simulation } {
  const sim = new Simulation(scenario, city);
  const samples: Metrics[] = [sim.metrics()];
  const end = Math.min(horizonTicks, sim.maxTicks);
  while (sim.tick < end) {
    sim.step();
    if (sim.tick % sampleEvery === 0) samples.push(sim.metrics());
    if (onProgress && sim.tick % 150 === 0) onProgress(sim.tick / end);
  }
  return { samples, events: sim.events.slice(), final: sim.metrics(), checksum: sim.checksum(), sim };
}
