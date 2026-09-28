import { useSyncExternalStore } from 'react';
import type { Caption } from '../render/director';
import type { QualityLevel } from '../render/quality';
import { DEFAULT_LAYERS, type LabelInfo, type Layers, type Selection } from '../render/Viewport';
import type { Metrics, Scenario } from '../sim/types';
import type { HeadlessResult, WorkerStatus } from '../worker/protocol';

export type ToolKind = 'earthquake' | 'flood' | 'fire' | 'storm' | 'infra' | 'evacuate';
export type RightTab = 'inspector' | 'analytics' | 'events' | 'causality' | 'compare';
export type LeftTab = 'disasters' | 'conditions' | 'layers' | 'scenarios';

export interface Toast {
  id: number;
  title: string;
  detail: string;
  severity: number;
  category: string;
  eventId: number;
}

export interface CompareState {
  running: boolean;
  progressA: number;
  progressB: number;
  a: HeadlessResult | null;
  b: HeadlessResult | null;
  labelA: string;
  labelB: string;
  scenarioB: Scenario | null;
  error: string | null;
}

export interface UIState {
  ready: boolean;
  loadingText: string;
  fatal: string | null;
  introDone: boolean;
  scenario: Scenario | null;
  status: WorkerStatus | null;
  metrics: Metrics | null;
  eventsVersion: number;
  historyVersion: number;
  selection: Selection | null;
  selectedEvent: number | null;
  tool: ToolKind | null;
  placing: boolean;
  placeLoc: { x: number; z: number } | null;
  layers: Layers;
  leftOpen: boolean;
  rightOpen: boolean;
  leftTab: LeftTab;
  rightTab: RightTab;
  cinematic: boolean;
  quality: QualityLevel;
  autoQuality: boolean;
  diagnostics: boolean;
  showNotes: boolean;
  showEditor: boolean;
  tourStep: number | null;
  toasts: Toast[];
  caption: Caption | null;
  labels: LabelInfo[];
  hover: { text: string; x: number; y: number } | null;
  compare: CompareState;
  confirmBranch: boolean;
}

export function createStore<T extends object>(init: T) {
  let state = init;
  const listeners = new Set<() => void>();
  return {
    get: () => state,
    set(patch: Partial<T> | ((s: T) => Partial<T>)) {
      const p = typeof patch === 'function' ? patch(state) : patch;
      let changed = false;
      for (const k of Object.keys(p) as (keyof T)[]) {
        if (!Object.is(state[k], p[k])) {
          changed = true;
          break;
        }
      }
      if (!changed) return;
      state = { ...state, ...p };
      for (const l of listeners) l();
    },
    subscribe(l: () => void) {
      listeners.add(l);
      return () => {
        listeners.delete(l);
      };
    },
  };
}

export const store = createStore<UIState>({
  ready: false,
  loadingText: 'Generating Meridian Bay…',
  fatal: null,
  introDone: false,
  scenario: null,
  status: null,
  metrics: null,
  eventsVersion: 0,
  historyVersion: 0,
  selection: null,
  selectedEvent: null,
  tool: null,
  placing: false,
  placeLoc: null,
  layers: { ...DEFAULT_LAYERS },
  leftOpen: true,
  rightOpen: true,
  leftTab: 'disasters',
  rightTab: 'analytics',
  cinematic: false,
  quality: 'high',
  autoQuality: true,
  diagnostics: false,
  showNotes: false,
  showEditor: false,
  tourStep: null,
  toasts: [],
  caption: null,
  labels: [],
  hover: null,
  compare: { running: false, progressA: 0, progressB: 0, a: null, b: null, labelA: '', labelB: '', scenarioB: null, error: null },
  confirmBranch: false,
});

/** Subscribe to a slice of UI state. Selectors must return stable values (primitives or stored objects). */
export function useUI<U>(sel: (s: UIState) => U): U {
  return useSyncExternalStore(store.subscribe, () => sel(store.get()));
}
