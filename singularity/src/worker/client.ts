import type { Command, CommandSpec, Frame, Metrics, Scenario, SimEvent } from '../sim/types';
import { SimHost } from './host';
import type { ExportData, FromWorker, HeadlessResult, ToWorker, WorkerStatus } from './protocol';

type Listener = () => void;

/**
 * Main-thread facade over the simulation worker. Keeps mirrors of the recorded event log,
 * metrics history and command list, plus the latest render frame. High-frequency frame
 * data is read directly by the renderer; the UI subscribes to coarse change notifications.
 */
export class SimClient {
  private worker: Worker | null = null;
  private host: SimHost | null = null;
  frame: Frame | null = null;
  frameSeq = 0;
  status: WorkerStatus | null = null;
  events: SimEvent[] = [];
  eventsVersion = 0;
  history: Metrics[] = [];
  historyVersion = 0;
  commands: Command[] = [];
  scenario: Scenario | null = null;
  maxTicks = 0;
  lastError: string | null = null;
  usingWorker = false;
  private listeners = new Set<Listener>();
  private frameListeners = new Set<(f: Frame) => void>();
  private eventListeners = new Set<(evs: SimEvent[]) => void>();
  private exportWaiters = new Map<number, (d: ExportData) => void>();
  private reqId = 0;

  constructor() {
    try {
      this.worker = new Worker(new URL('./sim.worker.ts', import.meta.url), { type: 'module' });
      this.worker.onmessage = (ev: MessageEvent<FromWorker>) => this.receive(ev.data);
      this.worker.onerror = (ev) => {
        this.lastError = ev.message || 'Simulation worker error';
        this.emit();
      };
      this.usingWorker = true;
    } catch {
      // Fallback: run the same host loop on the main thread.
      this.host = new SimHost((msg) => queueMicrotask(() => this.receive(msg)));
      this.usingWorker = false;
    }
  }

  dispose() {
    this.worker?.terminate();
    this.host?.dispose();
  }

  private send(msg: ToWorker) {
    if (this.worker) this.worker.postMessage(msg);
    else this.host?.handle(msg);
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  onFrame(fn: (f: Frame) => void): () => void {
    this.frameListeners.add(fn);
    return () => this.frameListeners.delete(fn);
  }
  onNewEvents(fn: (evs: SimEvent[]) => void): () => void {
    this.eventListeners.add(fn);
    return () => this.eventListeners.delete(fn);
  }
  private emit() {
    for (const l of this.listeners) l();
  }

  private receive(msg: FromWorker) {
    switch (msg.type) {
      case 'ready':
        this.maxTicks = msg.maxTicks;
        this.scenario = msg.scenario;
        this.events = [];
        this.history = [];
        this.eventsVersion++;
        this.historyVersion++;
        this.emit();
        break;
      case 'frame':
        this.frame = msg.frame;
        this.frameSeq++;
        for (const f of this.frameListeners) f(msg.frame);
        break;
      case 'status':
        this.status = msg.status;
        this.emit();
        break;
      case 'events': {
        const truncated = msg.from < this.events.length;
        if (this.events.length !== msg.from) this.events.length = Math.min(this.events.length, msg.from);
        for (const e of msg.events) this.events.push(e);
        this.eventsVersion++;
        if (!truncated && msg.events.length) for (const l of this.eventListeners) l(msg.events);
        this.emit();
        break;
      }
      case 'history':
        if (this.history.length !== msg.from) this.history.length = Math.min(this.history.length, msg.from);
        for (const s of msg.samples) this.history.push(s);
        this.historyVersion++;
        this.emit();
        break;
      case 'commands':
        this.commands = msg.commands;
        this.emit();
        break;
      case 'ended':
        this.emit();
        break;
      case 'exportData': {
        const w = this.exportWaiters.get(msg.requestId);
        if (w) {
          this.exportWaiters.delete(msg.requestId);
          w(msg.data);
        }
        break;
      }
      case 'error':
        this.lastError = msg.message;
        console.error('[simulation]', msg.message);
        this.emit();
        break;
      default:
        break;
    }
  }

  init(scenario: Scenario, autoplay = false) {
    this.frame = null;
    this.send({ type: 'init', scenario, autoplay });
  }
  play() {
    this.send({ type: 'play' });
  }
  pause() {
    this.send({ type: 'pause' });
  }
  setSpeed(speed: number) {
    this.send({ type: 'speed', speed });
  }
  seek(tick: number) {
    this.send({ type: 'seek', tick });
  }
  step(ticks = 1) {
    this.send({ type: 'step', ticks });
  }
  issue(spec: CommandSpec, atTick?: number) {
    this.send({ type: 'command', spec, atTick });
  }
  cancelCommand(id: number) {
    this.send({ type: 'cancelCommand', id });
  }
  requestExport(): Promise<ExportData> {
    const id = ++this.reqId;
    return new Promise((resolve) => {
      this.exportWaiters.set(id, resolve);
      this.send({ type: 'export', requestId: id });
    });
  }
}

/** Runs a scenario to a horizon in its own worker (used by comparison mode). */
export function runScenarioHeadless(scenario: Scenario, label: string, horizonTicks: number, onProgress: (p: number) => void): { promise: Promise<HeadlessResult>; cancel: () => void } {
  const runId = `${label}-${Math.random().toString(36).slice(2)}`;
  let worker: Worker | null = null;
  let host: SimHost | null = null;
  const promise = new Promise<HeadlessResult>((resolve, reject) => {
    const receive = (msg: FromWorker) => {
      if (msg.type === 'headlessProgress' && msg.runId === runId) onProgress(msg.progress);
      else if (msg.type === 'headlessResult' && msg.result.runId === runId) {
        resolve(msg.result);
        worker?.terminate();
        host?.dispose();
      } else if (msg.type === 'error') {
        reject(new Error(msg.message));
        worker?.terminate();
        host?.dispose();
      }
    };
    const msg: ToWorker = { type: 'headless', runId, label, scenario, horizonTicks, sampleEvery: 15 };
    try {
      worker = new Worker(new URL('./sim.worker.ts', import.meta.url), { type: 'module' });
      worker.onmessage = (ev: MessageEvent<FromWorker>) => receive(ev.data);
      worker.onerror = (ev) => reject(new Error(ev.message));
      worker.postMessage(msg);
    } catch {
      host = new SimHost((m) => queueMicrotask(() => receive(m)));
      setTimeout(() => host?.handle(msg), 0);
    }
  });
  return {
    promise,
    cancel: () => {
      worker?.terminate();
      host?.dispose();
    },
  };
}
