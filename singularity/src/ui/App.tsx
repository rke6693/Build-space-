import { useEffect, useRef } from 'react';
import type { QualityLevel } from '../render/quality';
import { Viewport, type ViewportCallbacks } from '../render/Viewport';
import { generateCity } from '../sim/city/generate';
import { SPEEDS } from '../sim/config';
import { builtinScenarios, validateScenario } from '../sim/scenario';
import type { Scenario } from '../sim/types';
import { addBookmark, goLive, seek, seekRelative, selectObject, setSpeed, toast, togglePlay } from './actions';
import { Diagnostics, CinematicOverlay, HoverTip, Labels, Loading, OverlayLegend, Toasts } from './Overlays';
import { ModelNotes } from './ModelNotes';
import { RightPanel } from './RightPanel';
import { runtime } from './runtime';
import { ScenarioEditor } from './ScenarioEditor';
import { store, useUI } from './store';
import { Timeline } from './Timeline';
import { Toolbox } from './Toolbox';
import { TopBar, setMode } from './TopBar';
import { Tour, tourSeen } from './Tour';

export function App() {
  const container = useRef<HTMLDivElement>(null);
  const cinematic = useUI((s) => s.cinematic);
  const introDone = useUI((s) => s.introDone);
  const ready = useUI((s) => s.ready);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const scnId = params.get('scenario') ?? 'baseline';
    const quality = (params.get('quality') as QualityLevel | null) ?? 'high';
    const intro = params.get('intro') !== '0';
    const tour = params.get('tour');
    const autoQuality = params.get('autoquality') !== '0';
    let scenario: Scenario = builtinScenarios().find((s) => s.id === scnId) ?? builtinScenarios()[0];
    const agents = Number(params.get('agents'));
    if (agents > 0) scenario = validateScenario({ ...scenario, agents }).scenario ?? scenario;

    const client = runtime.client;
    // ---- keep the UI store in sync with the worker (throttled)
    let lastMetrics = 0;
    let lastError: string | null = null;
    const unsub = client.subscribe(() => {
      if (client.lastError && client.lastError !== lastError) {
        lastError = client.lastError;
        toast('Simulation error — paused', `${client.lastError}. You can seek back or restart; please report this.`, 4, 'user');
      }
      const now = performance.now();
      const patch: Partial<ReturnType<typeof store.get>> = {
        status: client.status,
        eventsVersion: client.eventsVersion,
        historyVersion: client.historyVersion,
      };
      if (client.scenario && store.get().scenario?.id !== client.scenario.id) patch.scenario = { ...client.scenario, bookmarks: client.scenario.bookmarks ?? [] };
      if (now - lastMetrics > 220 && client.frame) {
        patch.metrics = client.frame.metrics;
        lastMetrics = now;
      }
      store.set(patch);
    });
    const unsubEv = client.onNewEvents((evs) => {
      runtime.viewport?.onEvents(evs);
      const st = client.status;
      if (st && !st.replay) {
        for (const e of evs.filter((x) => x.severity >= 3).slice(-2)) toast(e.title, e.detail, e.severity, e.category, e.id);
      }
    });

    const callbacks: ViewportCallbacks = {
      onSelect: (s) => selectObject(s),
      onPlace: (x, z) => store.set({ placeLoc: { x, z } }),
      onHover: (text, x, y) => store.set({ hover: text ? { text, x, y } : null }),
      onLabels: (labels) => store.set({ labels }),
      onCaption: (caption) => store.set({ caption }),
      onIntroDone: () => {
        store.set({ introDone: true });
        if ((tour === '1' || (tour !== '0' && !tourSeen())) && store.get().tourStep === null) store.set({ tourStep: 0 });
      },
      getSpeed: () => store.get().status?.speed ?? 1,
      setSpeed: (s) => client.setSpeed(s),
    };
    runtime.callbacks = callbacks;
    runtime.container = container.current;

    // phones: start with the city visible, panels one tap away
    if (window.innerWidth <= 760) store.set({ leftOpen: false, rightOpen: false });

    const boot = setTimeout(() => {
      const city = generateCity(scenario.seed);
      runtime.city = city;
      let vp: Viewport;
      try {
        vp = new Viewport(container.current!, city, client, callbacks, quality);
      } catch (err) {
        console.error(err);
        store.set({ fatal: 'This simulator needs WebGL 2, which this browser or device could not provide. Try a current Chrome, Edge, Firefox or Safari with hardware acceleration enabled.' });
        return;
      }
      vp.setAutoQuality(autoQuality);
      runtime.viewport = vp;
      vp.setLayers(store.get().layers);
      client.init(scenario, params.get('paused') !== '1');
      store.set({ ready: true, quality, autoQuality, scenario });
      if (intro) vp.playIntro();
      else {
        vp.skipIntro();
      }
    }, 40);

    // test / automation hook
    (window as unknown as { __singularity: unknown }).__singularity = { runtime, store };

    return () => {
      clearTimeout(boot);
      unsub();
      unsubEv();
    };
  }, []);

  // keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const s = store.get();
      if (s.showEditor || s.showNotes) {
        if (e.key === 'Escape') store.set({ showEditor: false, showNotes: false });
        return;
      }
      const k = e.key;
      if (k === ' ') {
        e.preventDefault();
        togglePlay();
      } else if (k >= '1' && k <= '5') setSpeed(SPEEDS[Number(k) - 1]);
      else if (k === 'ArrowLeft' && t?.getAttribute('role') !== 'slider') seekRelative(e.shiftKey ? -10 : -1);
      else if (k === 'ArrowRight' && t?.getAttribute('role') !== 'slider') seekRelative(e.shiftKey ? 10 : 1);
      else if (k === 'Home') seek(0);
      else if (k === 'End') goLive();
      else if (k === 'b' || k === 'B') addBookmark();
      else if (k === 'c' || k === 'C') setMode(!s.cinematic);
      else if (k === 'g' || k === 'G') store.set({ diagnostics: !s.diagnostics });
      else if (k === 'h' || k === '?') store.set({ tourStep: s.tourStep === null ? 0 : null });
      else if (k === '[') store.set({ leftOpen: !s.leftOpen });
      else if (k === ']') store.set({ rightOpen: !s.rightOpen });
      else if (k === 'o' || k === 'O') runtime.viewport?.overview();
      else if (k === 'p' || k === 'P') runtime.viewport?.topDown();
      else if (k === 'Escape') {
        if (runtime.viewport?.introPlaying) runtime.viewport.skipIntro();
        else if (s.placing) {
          store.set({ placing: false });
          runtime.viewport?.setPlacement(false);
        } else if (s.cinematic) setMode(false);
        else if (s.tourStep !== null) store.set({ tourStep: null });
        else if (s.tool) store.set({ tool: null });
        else if (s.selection) selectObject(null);
      } else return;
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className={`app ${cinematic ? 'cinematic' : ''} ${ready && !introDone ? 'intro' : ''}`}>
      <div className="viewport" ref={container} />
      <Labels />
      <TopBar />
      <Toolbox />
      <RightPanel />
      <OverlayLegend />
      <Timeline />
      <Diagnostics />
      <Toasts />
      <HoverTip />
      <CinematicOverlay />
      <ScenarioEditor />
      <ModelNotes />
      <Tour />
      <Loading />
      <div className="sr-only" aria-live="polite">
        Keyboard: Space play or pause, 1 to 5 speed, arrow keys seek, B bookmark, C cinematic mode, G diagnostics, H help, O overview, P plan view, [ and ] toggle panels, Escape cancels.
      </div>
    </div>
  );
}
