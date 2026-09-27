import type { Command, CommandSpec, Frame, Metrics, Scenario, SimEvent } from '../sim/types';

export interface WorkerStatus {
  tick: number;
  frontier: number;
  maxTicks: number;
  playing: boolean;
  speed: number;
  replay: boolean;
  stepsPerSec: number;
  msPerTick: number;
  keyframes: number;
  keyInterval: number;
  memoryBytes: number;
  verified: number;
  mismatches: number;
  lagging: boolean;
  ended: boolean;
  seeking: boolean;
  nanRepairs: number;
}

export interface HeadlessResult {
  runId: string;
  label: string;
  samples: Metrics[];
  events: SimEvent[];
  final: Metrics;
  checksum: number;
  bDS: Uint8Array;
  bPowered: Uint8Array;
  maxWater: Uint8Array;
  burned: Uint8Array;
  eClosed: Uint8Array;
}

export type ToWorker =
  | { type: 'init'; scenario: Scenario; autoplay?: boolean }
  | { type: 'play' }
  | { type: 'pause' }
  | { type: 'speed'; speed: number }
  | { type: 'seek'; tick: number }
  | { type: 'step'; ticks: number }
  | { type: 'command'; spec: CommandSpec; atTick?: number }
  | { type: 'cancelCommand'; id: number }
  | { type: 'export'; requestId: number }
  | { type: 'headless'; runId: string; label: string; scenario: Scenario; horizonTicks: number; sampleEvery: number };

export interface ExportData {
  scenario: Scenario;
  history: Metrics[];
  events: SimEvent[];
  checksum: number;
  verification: { checked: number; mismatches: number };
}

export type FromWorker =
  | { type: 'ready'; maxTicks: number; scenario: Scenario }
  | { type: 'frame'; frame: Frame }
  | { type: 'status'; status: WorkerStatus }
  | { type: 'events'; from: number; events: SimEvent[] }
  | { type: 'history'; from: number; samples: Metrics[] }
  | { type: 'commands'; commands: Command[] }
  | { type: 'ended' }
  | { type: 'exportData'; requestId: number; data: ExportData }
  | { type: 'headlessProgress'; runId: string; progress: number }
  | { type: 'headlessResult'; result: HeadlessResult }
  | { type: 'error'; message: string };
