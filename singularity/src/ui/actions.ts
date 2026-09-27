import { Viewport } from '../render/Viewport';
import { generateCity } from '../sim/city/generate';
import { STEP_SECONDS } from '../sim/config';
import { buildSummary, eventsToCSV, metricsToCSV } from '../sim/export';
import { builtinScenarios, cloneScenario, newScenarioId, parseScenario, serializeScenario, validateScenario } from '../sim/scenario';
import type { CommandSpec, Scenario } from '../sim/types';
import { runScenarioHeadless } from '../worker/client';
import { runtime } from './runtime';
import { store } from './store';

const LIB_KEY = 'singularity.scenarios.v1';

// ------------------------------------------------------------------ simulation control
export function togglePlay() {
  const st = store.get().status;
  if (!st) return;
  if (st.playing) runtime.client.pause();
  else runtime.client.play();
}

export function setSpeed(s: number) {
  runtime.client.setSpeed(s);
}

export function seek(tick: number) {
  const st = store.get().status;
  const max = st?.maxTicks ?? runtime.client.maxTicks;
  runtime.client.seek(Math.max(0, Math.min(max, Math.round(tick))));
}

export function seekRelative(minutes: number) {
  const st = store.get().status;
  if (!st) return;
  seek(st.tick + (minutes * 60) / STEP_SECONDS);
}

export function goLive() {
  const st = store.get().status;
  if (st) seek(st.frontier);
}

/**
 * Issues a command. If the viewer is replaying the past, the first call asks for
 * confirmation (branching discards the recorded future); `force` confirms.
 */
export function issue(spec: CommandSpec, delayMin = 0, force = false): boolean {
  const st = store.get().status;
  if (st?.replay && !force) {
    store.set({ confirmBranch: true });
    return false;
  }
  store.set({ confirmBranch: false });
  const at = st ? st.tick + Math.round((delayMin * 60) / STEP_SECONDS) : undefined;
  runtime.client.issue(spec, at);
  if (st && !st.playing && delayMin === 0) runtime.client.step(1);
  return true;
}

export function cancelCommand(id: number) {
  runtime.client.cancelCommand(id);
}

export function addBookmark(label?: string) {
  const s = store.get();
  if (!s.scenario || !s.status) return;
  const tick = s.status.tick;
  const bookmarks = [...s.scenario.bookmarks.filter((b) => b.tick !== tick), { tick, label: label || `Bookmark ${s.scenario.bookmarks.length + 1}` }].sort((a, b) => a.tick - b.tick);
  store.set({ scenario: { ...s.scenario, bookmarks } });
}

export function removeBookmark(tick: number) {
  const s = store.get();
  if (!s.scenario) return;
  store.set({ scenario: { ...s.scenario, bookmarks: s.scenario.bookmarks.filter((b) => b.tick !== tick) } });
}

// ------------------------------------------------------------------ scenarios
/** The scenario as it stands now: definition + every command issued + bookmarks. */
export function currentScenario(): Scenario | null {
  const s = store.get().scenario;
  if (!s) return null;
  const out = cloneScenario(s);
  out.commands = runtime.client.commands.map((c) => ({ ...c, source: 'scenario' as const, spec: JSON.parse(JSON.stringify(c.spec)) as CommandSpec }));
  delete out.builtin;
  return out;
}

export function loadLibrary(): Scenario[] {
  try {
    const raw = localStorage.getItem(LIB_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as unknown[];
    return arr.map((x) => validateScenario(x).scenario).filter((x): x is Scenario => !!x);
  } catch {
    return [];
  }
}

function writeLibrary(list: Scenario[]) {
  try {
    localStorage.setItem(LIB_KEY, JSON.stringify(list));
  } catch {
    toast('Could not save', 'Browser storage is unavailable (private mode or quota).', 2, 'user');
  }
}

export function saveToLibrary(s: Scenario): Scenario {
  const list = loadLibrary();
  const copy = cloneScenario(s);
  if (copy.builtin || builtinScenarios().some((b) => b.id === copy.id)) copy.id = newScenarioId('user');
  delete copy.builtin;
  const idx = list.findIndex((x) => x.id === copy.id);
  if (idx >= 0) list[idx] = copy;
  else list.push(copy);
  writeLibrary(list);
  return copy;
}

export function deleteFromLibrary(id: string) {
  writeLibrary(loadLibrary().filter((x) => x.id !== id));
}

export function loadScenario(s: Scenario, autoplay = true) {
  const scn = cloneScenario(s);
  const vp = runtime.viewport;
  if (runtime.city && runtime.city.seed !== scn.seed && runtime.container) {
    // New seed ⇒ new city: rebuild the renderer around it.
    store.set({ ready: false, loadingText: `Generating city for seed ${scn.seed}…` });
    setTimeout(() => {
      const quality = store.get().quality;
      vp?.dispose();
      const city = generateCity(scn.seed);
      runtime.city = city;
      runtime.viewport = new Viewport(runtime.container!, city, runtime.client, runtime.callbacks!, quality);
      runtime.viewport.setLayers(store.get().layers);
      runtime.viewport.skipIntro();
      runtime.client.init(scn, autoplay);
      store.set({ ready: true, scenario: scn, selection: null, selectedEvent: null, compare: { ...store.get().compare, a: null, b: null } });
    }, 30);
    return;
  }
  runtime.client.init(scn, autoplay);
  vp?.select(null);
  store.set({ scenario: scn, selection: null, selectedEvent: null, confirmBranch: false });
}

export function resetSimulation() {
  const s = currentScenario();
  const orig = store.get().scenario;
  if (!s || !orig) return;
  // Restart from t=0 keeping every command issued so far (they become scheduled events).
  loadScenario({ ...s, bookmarks: orig.bookmarks }, false);
}

export function importScenarioFile(file: File): Promise<string[]> {
  return file.text().then((text) => {
    const { scenario, errors } = parseScenario(text);
    if (!scenario) return errors;
    const saved = saveToLibrary(scenario);
    loadScenario(saved);
    return errors;
  });
}

// ------------------------------------------------------------------ exports
export function download(name: string, text: string, type: string) {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function exportResults(kind: 'json' | 'metrics' | 'events') {
  const d = await runtime.client.requestExport();
  const base = `singularity-${(d.scenario.name || 'scenario').toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40)}`;
  if (kind === 'json') download(`${base}-summary.json`, JSON.stringify(buildSummary(d.scenario, d.history, d.events, d.checksum, d.verification), null, 2), 'application/json');
  else if (kind === 'metrics') download(`${base}-metrics.csv`, metricsToCSV(d.history), 'text/csv');
  else download(`${base}-events.csv`, eventsToCSV(d.events), 'text/csv');
}

export function exportScenario() {
  const s = currentScenario();
  if (!s) return;
  const orig = store.get().scenario;
  download(`${s.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.scenario.json`, serializeScenario({ ...s, bookmarks: orig?.bookmarks ?? [] }), 'application/json');
}

// ------------------------------------------------------------------ comparison
let cancelCompare: (() => void) | null = null;

export function runComparison(b: Scenario, labelB: string, horizonTicks: number) {
  const a = currentScenario();
  if (!a) return;
  cancelCompare?.();
  // Same initial conditions: B inherits A's seed, population, start time and base environment.
  const bb: Scenario = { ...cloneScenario(b), seed: a.seed, agents: a.agents, startHour: a.startHour, env: { ...a.env }, durationMin: Math.max(a.durationMin, b.durationMin) };
  store.set({ compare: { running: true, progressA: 0, progressB: 0, a: null, b: null, labelA: 'A — current session', labelB, scenarioB: bb, error: null } });
  const ra = runScenarioHeadless(a, 'A', horizonTicks, (p) => store.set((s) => ({ compare: { ...s.compare, progressA: p } })));
  const rb = runScenarioHeadless(bb, 'B', horizonTicks, (p) => store.set((s) => ({ compare: { ...s.compare, progressB: p } })));
  cancelCompare = () => {
    ra.cancel();
    rb.cancel();
  };
  Promise.all([ra.promise, rb.promise])
    .then(([resA, resB]) => store.set((s) => ({ compare: { ...s.compare, running: false, a: resA, b: resB, progressA: 1, progressB: 1 } })))
    .catch((e: Error) => store.set((s) => ({ compare: { ...s.compare, running: false, error: e.message } })));
}

export function cancelComparison() {
  cancelCompare?.();
  cancelCompare = null;
  store.set((s) => ({ compare: { ...s.compare, running: false } }));
}

// ------------------------------------------------------------------ toasts
let toastId = 0;
export function toast(title: string, detail: string, severity: number, category: string, eventId = -1) {
  const t = { id: ++toastId, title, detail, severity, category, eventId };
  store.set((s) => ({ toasts: [...s.toasts.slice(-2), t] }));
  setTimeout(() => store.set((s) => ({ toasts: s.toasts.filter((x) => x.id !== t.id) })), 6500);
}

export function selectEvent(id: number | null, focus = true) {
  store.set({ selectedEvent: id, rightOpen: true });
  if (id === null) return;
  const ev = runtime.client.events[id];
  if (!ev) return;
  if (focus) runtime.viewport?.focusEvent(ev);
  if (ev.subject?.kind === 'asset') selectObject({ kind: 'asset', id: ev.subject.id }, false);
  else if (ev.subject?.kind === 'bridge') selectObject({ kind: 'bridge', id: ev.subject.id }, false);
  else if (ev.subject?.kind === 'levee') selectObject({ kind: 'levee', id: ev.subject.id }, false);
}

export function selectObject(sel: import('../render/Viewport').Selection | null, switchTab = true) {
  runtime.viewport?.select(sel);
  store.set((s) => ({ selection: sel, rightOpen: sel ? true : s.rightOpen, rightTab: sel && switchTab ? 'inspector' : s.rightTab }));
}

export function focusSelection() {
  const s = store.get().selection;
  const vp = runtime.viewport;
  if (!s || !vp) return;
  const p = vp.positionOf(s);
  if (p) vp.focus(p.x, p.z, p.r);
}
