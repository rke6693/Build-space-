import { useEffect, useState } from 'react';
import { store, useUI } from './store';

interface Step {
  target: string | null;
  title: string;
  body: string;
  done?: () => boolean;
  prepare?: () => void;
}

/** Later steps point at the earthquake form: open it if the user skipped ahead. */
function ensureQuakeTool() {
  store.set({ leftOpen: true, leftTab: 'disasters', ...(store.get().tool ? {} : { tool: 'earthquake' as const }) });
}

const STEPS: Step[] = [
  {
    target: null,
    title: 'Welcome to Meridian Bay',
    body: 'A procedurally generated coastal city of 240,000 simulated residents: a harbour, a river with four bridges, a downtown skyline and the Eastport polder that lies below sea level behind a seawall. Everything you will see is computed by a deterministic simulation.',
  },
  {
    target: '.viewport',
    title: 'Move the camera',
    body: 'Drag to orbit; right-drag or two-finger drag to pan; scroll or pinch to zoom. Overview and top-down buttons are in the Layers tab (keys O and P).',
  },
  {
    target: '[data-testid="tool-earthquake"]',
    title: 'Choose a disaster',
    body: 'Open the disaster toolbox and select Earthquake.',
    prepare: () => store.set({ leftOpen: true, leftTab: 'disasters' }),
    done: () => store.get().tool === 'earthquake',
  },
  {
    target: '[data-testid="tool-form"]',
    prepare: ensureQuakeTool,
    title: 'Set it up',
    body: 'Keep the default offshore epicentre or press “Pick on map” and click anywhere. Try a magnitude around 7.',
  },
  {
    target: '[data-testid="trigger"]',
    prepare: ensureQuakeTool,
    title: 'Trigger it',
    body: 'Press Trigger. Watch the wavefront cross the city, buildings sway, and damage, outages and fires propagate. The first cascades appear within seconds.',
    done: () => store.get().tool === null,
  },
  {
    target: '[data-tour="inspector"]',
    title: 'Inspect consequences',
    body: 'Click any building or facility to inspect it. The Events and Causes tabs explain every failure: select an event and read “Why did this happen?”.',
    prepare: () => store.set({ rightOpen: true, rightTab: 'events' }),
  },
  {
    target: '[data-tour="timeline"]',
    title: 'Pause, rewind, replay',
    body: 'Space pauses. Drag the playhead back to replay — seeking restores a keyframe and deterministically re-simulates, verifying checksums. Markers on the track are major events; B adds a bookmark.',
  },
  {
    target: '[data-testid="right-tab-compare"]',
    title: 'Compare scenarios',
    body: 'Run your session against a what-if variant (e.g. a retrofitted city) from the same initial conditions. Or load the Showcase scenario from the Scenarios tab. Press C any time for the cinematic director.',
  },
];

const KEY = 'singularity.tour.v1';

export function tourSeen(): boolean {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return true;
  }
}

export function Tour() {
  const step = useUI((s) => s.tourStep);
  const tool = useUI((s) => s.tool);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const s = step !== null ? STEPS[step] : null;
  useEffect(() => {
    if (!s) return;
    s.prepare?.();
    const upd = () => {
      const el = s.target ? document.querySelector(s.target) : null;
      setRect(el ? el.getBoundingClientRect() : null);
    };
    upd();
    const t = setInterval(upd, 300);
    return () => clearInterval(t);
  }, [s]);
  useEffect(() => {
    if (s?.done && s.done() && step !== null) store.set({ tourStep: Math.min(STEPS.length - 1, step + 1) });
  }, [tool, s, step]);
  if (!s || step === null) return null;
  const finish = () => {
    try {
      localStorage.setItem(KEY, '1');
    } catch {
      /* ignore */
    }
    store.set({ tourStep: null });
  };
  const pad = 6;
  const cardStyle: React.CSSProperties = rect
    ? rect.left > window.innerWidth / 2
      ? { top: Math.min(window.innerHeight - 220, Math.max(70, rect.top)), left: Math.max(12, rect.left - 350) }
      : rect.top > window.innerHeight * 0.6
        ? { top: Math.max(70, rect.top - 200), left: Math.min(window.innerWidth - 350, Math.max(12, rect.left)) }
        : { top: Math.min(window.innerHeight - 220, rect.top), left: Math.min(window.innerWidth - 350, rect.right + 16) }
    : { top: '30%', left: 'calc(50% - 165px)' };
  const wide = rect && (rect.width > window.innerWidth * 0.8 || rect.height > window.innerHeight * 0.8);
  return (
    <>
      {rect && !wide && <div className="tour-spot" style={{ left: rect.left - pad, top: rect.top - pad, width: rect.width + pad * 2, height: rect.height + pad * 2 }} />}
      {(!rect || wide) && <div className="tour-spot" style={{ left: '50%', top: '40%', width: 0, height: 0, border: 0 }} />}
      <div className="tour-card" style={cardStyle} role="dialog" aria-labelledby="tour-title" data-testid="tour">
        <div className="steps">
          Step {step + 1} of {STEPS.length}
        </div>
        <h3 id="tour-title">{s.title}</h3>
        <p>{s.body}</p>
        <div className="btn-row">
          {step > 0 && (
            <button className="btn small" onClick={() => store.set({ tourStep: step - 1 })}>
              Back
            </button>
          )}
          {step < STEPS.length - 1 ? (
            <button className="btn small primary" onClick={() => store.set({ tourStep: step + 1 })} data-testid="tour-next">
              Next
            </button>
          ) : (
            <button className="btn small primary" onClick={finish}>
              Start exploring
            </button>
          )}
          <button className="btn small" onClick={finish} data-testid="tour-skip">
            Skip tour
          </button>
        </div>
      </div>
    </>
  );
}
