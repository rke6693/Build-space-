import { SPEEDS, TICKS_PER_SECOND_1X } from '../sim/config';
import { SimController, frameTransferables, runHeadless } from '../sim/controller';
import type { FromWorker, ToWorker, WorkerStatus } from './protocol';

type Post = (msg: FromWorker, transfer?: Transferable[]) => void;

/**
 * Runs the simulation loop decoupled from rendering: a fixed number of ticks per real
 * second (scaled by playback speed), bounded per iteration so the host never stalls, and
 * render frames published at most ~30 times per second. Used inside the Web Worker and,
 * as a fallback, on the main thread.
 */
export class SimHost {
  private ctl: SimController | null = null;
  private playing = false;
  private speed = 1;
  private acc = 0;
  private last = now();
  private lastFrame = 0;
  private lastStatus = 0;
  private dirty = true;
  private stepsWindow = 0;
  private windowStart = now();
  private stepsPerSec = 0;
  private lagging = false;
  private ended = false;
  private seeking = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;

  constructor(private post: Post) {
    this.schedule();
  }

  dispose() {
    this.disposed = true;
    if (this.timer) clearTimeout(this.timer);
  }

  handle(msg: ToWorker) {
    try {
      this.handleUnsafe(msg);
    } catch (e) {
      this.post({ type: 'error', message: e instanceof Error ? e.message : String(e) });
    }
  }

  private handleUnsafe(msg: ToWorker) {
    if (msg.type === 'headless') {
      const r = runHeadless(msg.scenario, msg.horizonTicks, msg.sampleEvery, (p) => this.post({ type: 'headlessProgress', runId: msg.runId, progress: p }));
      const s = r.sim.s;
      const result = {
        runId: msg.runId,
        label: msg.label,
        samples: r.samples,
        events: r.events.filter((e) => e.severity >= 2),
        final: r.final,
        checksum: r.checksum,
        bDS: s.bDS.slice(),
        bPowered: r.sim.bPowered.slice(),
        maxWater: s.maxWater.slice(),
        burned: s.burned.slice(),
        eClosed: s.eClosed.slice(),
      };
      this.post({ type: 'headlessResult', result }, [result.bDS.buffer, result.bPowered.buffer, result.maxWater.buffer, result.burned.buffer, result.eClosed.buffer]);
      return;
    }
    if (msg.type === 'init') {
      this.ctl = new SimController(msg.scenario);
      this.playing = !!msg.autoplay;
      this.ended = false;
      this.acc = 0;
      this.post({ type: 'ready', maxTicks: this.ctl.maxTicks, scenario: this.ctl.scenario });
      this.post({ type: 'events', from: 0, events: [] });
      this.flushTimeline(true);
      this.postCommands();
      this.dirty = true;
      this.publish(true);
      return;
    }
    const ctl = this.ctl;
    if (!ctl) return;
    switch (msg.type) {
      case 'play':
        if (ctl.tick >= ctl.maxTicks) break;
        this.playing = true;
        this.ended = false;
        this.last = now();
        break;
      case 'pause':
        this.playing = false;
        break;
      case 'speed':
        this.speed = SPEEDS.includes(msg.speed as (typeof SPEEDS)[number]) ? msg.speed : Math.max(0.05, Math.min(20, msg.speed));
        break;
      case 'seek':
        this.seeking = true;
        ctl.seek(msg.tick);
        this.seeking = false;
        this.ended = ctl.tick >= ctl.maxTicks;
        this.acc = 0;
        this.flushTimeline();
        this.dirty = true;
        break;
      case 'step':
        ctl.advance(Math.max(1, msg.ticks));
        this.flushTimeline();
        this.dirty = true;
        break;
      case 'command':
        ctl.issue(msg.spec, msg.atTick);
        this.flushTimeline();
        this.postCommands();
        this.dirty = true;
        break;
      case 'cancelCommand':
        ctl.cancelCommand(msg.id);
        this.flushTimeline();
        this.postCommands();
        break;
      case 'export':
        this.post({
          type: 'exportData',
          requestId: msg.requestId,
          data: { scenario: ctl.currentScenario(), history: ctl.history.slice(), events: ctl.recorded.slice(), checksum: ctl.sim.checksum(), verification: { ...ctl.verification } },
        });
        break;
    }
    this.publish(true);
  }

  private postCommands() {
    if (this.ctl) this.post({ type: 'commands', commands: this.ctl.commands.map((c) => ({ ...c })) });
  }

  private sentVersion = -1;

  /** Sends new events / metric samples; a truncated timeline (branch) is resent from its cut point. */
  private flushTimeline(force = false) {
    const ctl = this.ctl;
    if (!ctl) return;
    const changed = ctl.timelineVersion !== this.sentVersion;
    this.sentVersion = ctl.timelineVersion;
    const ev = ctl.drainEvents();
    if (force || changed || ev.events.length) this.post({ type: 'events', from: ev.from, events: ev.events });
    const h = ctl.drainHistory();
    if (force || changed || h.samples.length) this.post({ type: 'history', from: h.from, samples: h.samples });
  }

  private status(): WorkerStatus {
    const ctl = this.ctl!;
    return {
      tick: ctl.tick,
      frontier: ctl.frontier,
      maxTicks: ctl.maxTicks,
      playing: this.playing,
      speed: this.speed,
      replay: ctl.replaying,
      stepsPerSec: this.stepsPerSec,
      msPerTick: ctl.sim.perf.avgStepMs,
      keyframes: ctl.keyframes.length,
      keyInterval: ctl.keyInterval,
      memoryBytes: ctl.memoryBytes(),
      verified: ctl.verification.checked,
      mismatches: ctl.verification.mismatches,
      lagging: this.lagging,
      ended: this.ended,
      seeking: this.seeking,
      nanRepairs: ctl.sim.s.repairedNaN,
    };
  }

  private publish(force = false) {
    const ctl = this.ctl;
    if (!ctl) return;
    const t = now();
    if (this.dirty && (force || t - this.lastFrame > 33)) {
      const frame = ctl.buildFrame({ playing: this.playing, speed: this.speed });
      this.post({ type: 'frame', frame }, frameTransferables(frame));
      this.dirty = false;
      this.lastFrame = t;
    }
    if (force || t - this.lastStatus > 250) {
      this.post({ type: 'status', status: this.status() });
      this.lastStatus = t;
    }
  }

  private schedule() {
    if (this.disposed) return;
    this.timer = setTimeout(() => this.loop(), this.playing ? 4 : 30);
  }

  private loop() {
    try {
      this.tickLoop();
    } catch (e) {
      // never let an exception kill the loop silently: pause and report
      this.playing = false;
      this.post({ type: 'error', message: e instanceof Error ? e.message : String(e) });
      this.dirty = true;
      this.publish(true);
    }
    this.schedule();
  }

  private tickLoop() {
    const t = now();
    const dt = Math.min(0.25, (t - this.last) / 1000);
    this.last = t;
    const ctl = this.ctl;
    if (ctl && this.playing) {
      this.acc += dt * this.speed * TICKS_PER_SECOND_1X;
      const n = Math.floor(this.acc);
      if (n > 0) {
        const done = ctl.advance(n, 22);
        this.acc -= done;
        this.lagging = done < n;
        if (this.lagging) this.acc = Math.min(this.acc, this.speed * TICKS_PER_SECOND_1X * 0.25); // drop backlog instead of spiralling
        this.stepsWindow += done;
        if (done > 0) {
          this.dirty = true;
          this.flushTimeline();
        }
        if (ctl.tick >= ctl.maxTicks) {
          this.playing = false;
          this.ended = true;
          this.post({ type: 'ended' });
        }
      }
    }
    if (t - this.windowStart > 1000) {
      this.stepsPerSec = (this.stepsWindow * 1000) / (t - this.windowStart);
      this.stepsWindow = 0;
      this.windowStart = t;
    }
    this.publish();
  }
}

function now(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}
