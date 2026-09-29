import { useEffect, useState } from 'react';
import { OVERLAY_LEGENDS } from '../render/overlays';
import { Director } from '../render/director';
import { selectEvent, selectObject } from './actions';
import { CATEGORY, fmtInt, statusColor } from './format';
import { runtime } from './runtime';
import { store, useUI } from './store';
import { setMode } from './TopBar';

export function Labels() {
  const labels = useUI((s) => s.labels);
  const cinematic = useUI((s) => s.cinematic);
  const introDone = useUI((s) => s.introDone);
  if (cinematic || !introDone) return null;
  // simple greedy declutter: important first, skip overlaps
  const placed: { x: number; y: number; w: number }[] = [];
  const sorted = [...labels].sort((a, b) => Number(b.important) - Number(a.important) || a.status - b.status);
  const shown = sorted.filter((l) => {
    const w = l.text.length * 6 + 22;
    if (placed.some((p) => Math.abs(p.x - l.x) < (p.w + w) / 2 && Math.abs(p.y - l.y) < 20)) return false;
    placed.push({ x: l.x, y: l.y, w });
    return true;
  });
  return (
    <div className="labels" aria-hidden="false">
      {shown.map((l) => (
        <button key={l.key} className={`label ${l.status === 0 ? 'down' : ''}`} style={{ left: l.x, top: l.y }} onClick={() => selectObject(l.selection)} title={`${l.text}: ${l.status === 2 ? 'operational' : l.status === 1 ? 'degraded' : 'out of service'}`}>
          <i style={{ background: statusColor(l.status) }} />
          {l.text}
        </button>
      ))}
    </div>
  );
}

export function OverlayLegend() {
  const layers = useUI((s) => s.layers);
  const cinematic = useUI((s) => s.cinematic);
  const kind = runtime.viewport?.groundOverlay ?? 'none';
  void layers;
  const lg = OVERLAY_LEGENDS[kind];
  const showAgents = layers.population;
  if (cinematic || (!lg && !showAgents)) return null;
  return (
    <div className="legend-float panel chrome" aria-label="Map legend">
      {lg && (
        <>
          <b style={{ fontSize: 11 }}>{lg.title}</b>
          <div className="stops">
            {lg.stops.map(([c, t]) => (
              <span key={t}>
                <i style={{ background: c }} />
                {t}
              </span>
            ))}
          </div>
        </>
      )}
      {showAgents && (
        <div className="stops" style={{ marginTop: lg ? 6 : 0 }}>
          <span>
            <i style={{ background: '#bfe6ff', borderRadius: '50%', width: 8, height: 8 }} />
            travelling
          </span>
          <span>
            <i style={{ background: '#ffb020', borderRadius: '50%', width: 8, height: 8 }} />
            evacuating
          </span>
          <span>
            <i style={{ background: '#3fd08a', borderRadius: '50%', width: 8, height: 8 }} />
            sheltered
          </span>
          <span>
            <i style={{ background: '#ff4d5e', borderRadius: '50%', width: 8, height: 8 }} />
            injured
          </span>
          <span>
            <i style={{ background: '#ffffff', borderRadius: '50%', width: 8, height: 8 }} />
            fire crew
          </span>
        </div>
      )}
    </div>
  );
}

export function HoverTip() {
  const h = useUI((s) => s.hover);
  if (!h) return null;
  return (
    <div className="tooltip-float" style={{ left: h.x, top: h.y }}>
      {h.text}
    </div>
  );
}

export function Toasts() {
  const toasts = useUI((s) => s.toasts);
  const cinematic = useUI((s) => s.cinematic);
  if (cinematic) return null;
  return (
    <div className="toasts" aria-live="polite" aria-relevant="additions">
      {toasts.map((t) => (
        <button key={t.id} className="toast" onClick={() => t.eventId >= 0 && (store.set({ rightTab: 'events' }), selectEvent(t.eventId))}>
          <span className="bar" style={{ background: CATEGORY[t.category]?.color ?? '#888' }} />
          <span>
            <b>{t.title}</b>
            <span>{t.detail.length > 140 ? t.detail.slice(0, 138) + '…' : t.detail}</span>
          </span>
        </button>
      ))}
    </div>
  );
}

export function CinematicOverlay() {
  const cinematic = useUI((s) => s.cinematic);
  const caption = useUI((s) => s.caption);
  const introDone = useUI((s) => s.introDone);
  const ready = useUI((s) => s.ready);
  if (!ready) return null;
  if (!introDone) {
    return (
      <div className="letterbox">
        <div className="intro-title">
          <h1>SINGULARITY</h1>
          <p>Meridian Bay · coastal city catastrophe simulator</p>
        </div>
        <button className="btn skip" onClick={() => runtime.viewport?.skipIntro()} data-testid="skip-intro">
          Skip intro (Esc)
        </button>
      </div>
    );
  }
  if (!cinematic) return null;
  return (
    <div className="letterbox">
      <button className="cine-hint" onClick={() => setMode(false)} data-testid="exit-cinematic">
        Cinematic director · <u>exit</u> (C / Esc)
      </button>
      {caption && (
        <div className="caption" key={caption.title + caption.tick}>
          <div className="cat" style={{ color: CATEGORY[caption.category]?.color }}>
            <i style={{ background: CATEGORY[caption.category]?.color }} />
            {CATEGORY[caption.category]?.label} · {Director.captionTime(caption.tick)}
          </div>
          <h2>{caption.title}</h2>
          <p>{caption.detail}</p>
        </div>
      )}
    </div>
  );
}

export function Diagnostics() {
  const on = useUI((s) => s.diagnostics);
  const status = useUI((s) => s.status);
  const metrics = useUI((s) => s.metrics);
  const [, force] = useState(0);
  useEffect(() => {
    if (!on) return;
    const t = setInterval(() => force((x) => x + 1), 500);
    return () => clearInterval(t);
  }, [on]);
  if (!on) return null;
  const r = runtime.viewport?.getStats();
  const city = runtime.city;
  return (
    <div className="diag panel" role="region" aria-label="Developer diagnostics" data-testid="diagnostics">
      <h4>
        Diagnostics
        <button className="icon-btn" style={{ width: 20, height: 20 }} aria-label="Close diagnostics" onClick={() => store.set({ diagnostics: false })}>
          ×
        </button>
      </h4>
      <dl>
        <dt>Render FPS</dt>
        <dd>{r ? r.fps.toFixed(0) : '—'}</dd>
        <dt>Frame time</dt>
        <dd>{r ? `${r.frameMs.toFixed(1)} ms` : '—'}</dd>
        <dt>Draw calls / tris</dt>
        <dd>{r ? `${r.drawCalls} / ${(r.triangles / 1e6).toFixed(2)}M` : '—'}</dd>
        <dt>Geometries / textures</dt>
        <dd>{r ? `${r.geometries} / ${r.textures}` : '—'}</dd>
        <dt>Quality</dt>
        <dd>
          {r?.quality} {r?.autoQuality ? '(auto)' : ''} · pr {r?.pixelRatio.toFixed(2)}
        </dd>
        <dt>Sim steps / s</dt>
        <dd>{status ? status.stepsPerSec.toFixed(0) : '—'}</dd>
        <dt>Sim cost / step</dt>
        <dd>{status ? `${status.msPerTick.toFixed(2)} ms` : '—'}</dd>
        <dt>Tick / frontier</dt>
        <dd>
          {status?.tick ?? 0} / {status?.frontier ?? 0}
        </dd>
        <dt>Keyframes</dt>
        <dd>
          {status?.keyframes ?? 0} every {status?.keyInterval ?? 0} ticks
        </dd>
        <dt>Timeline memory</dt>
        <dd>{status ? `${(status.memoryBytes / 1e6).toFixed(1)} MB` : '—'}</dd>
        <dt>Replay checks</dt>
        <dd>
          {status?.verified ?? 0} ok · {status?.mismatches ?? 0} mismatch
        </dd>
        <dt>NaN repairs</dt>
        <dd>{status?.nanRepairs ?? 0}</dd>
        <dt>Buildings</dt>
        <dd>{city ? fmtInt(city.buildings.count) : '—'}</dd>
        <dt>Agents drawn</dt>
        <dd>{r ? fmtInt(r.agentsVisible) : '—'}</dd>
        <dt>Burning cells</dt>
        <dd>{metrics?.activeFires ?? 0}</dd>
        <dt>Events</dt>
        <dd>{fmtInt(runtime.client.events.length)}</dd>
        <dt>Simulation thread</dt>
        <dd>{runtime.client.usingWorker ? 'Web Worker' : 'main (fallback)'}</dd>
        {status?.lagging && (
          <>
            <dt style={{ color: '#fab219' }}>Sim lagging</dt>
            <dd style={{ color: '#fab219' }}>speed capped</dd>
          </>
        )}
      </dl>
    </div>
  );
}

export function Loading() {
  const ready = useUI((s) => s.ready);
  const text = useUI((s) => s.loadingText);
  const fatal = useUI((s) => s.fatal);
  if (ready && !fatal) return null;
  return (
    <div className="loading" role={fatal ? 'alert' : 'status'} aria-live="polite">
      <div className="inner">
        {!fatal && <div className="spinner" />}
        <h1>SINGULARITY</h1>
        <p style={fatal ? { maxWidth: 460, lineHeight: 1.5, color: 'var(--text-2)' } : undefined}>{fatal ?? text}</p>
      </div>
    </div>
  );
}

/** Embedded build only: exports appear here as text to copy (downloads are blocked by the host). */
export function ExportDialog() {
  const doc = useUI((s) => s.exportDoc);
  const [copied, setCopied] = useState<'idle' | 'ok' | 'select'>('idle');
  useEffect(() => setCopied('idle'), [doc]);
  if (!doc) return null;
  const close = () => store.set({ exportDoc: null });
  const selectAll = () => {
    const ta = document.getElementById('export-text') as HTMLTextAreaElement | null;
    ta?.focus();
    ta?.select();
  };
  const copy = () => {
    const done = () => setCopied('ok');
    const fallback = () => {
      selectAll();
      let ok = false;
      try {
        ok = document.execCommand('copy');
      } catch {
        ok = false;
      }
      setCopied(ok ? 'ok' : 'select');
    };
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(doc.text).then(done, fallback);
    else fallback();
  };
  const lines = doc.text.split('\n').length;
  return (
    <div className="modal-back" role="dialog" aria-modal="true" aria-labelledby="export-title" onKeyDown={(e) => e.key === 'Escape' && close()}>
      <div className="modal" style={{ width: 'min(760px, 100%)' }}>
        <div className="modal-head">
          <h2 id="export-title">{doc.name}</h2>
          <button className="icon-btn" aria-label="Close export" onClick={close}>
            ×
          </button>
        </div>
        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <p className="hint" style={{ margin: 0 }}>
            {lines.toLocaleString()} lines. Copy the text and paste it into a file named <b>{doc.name}</b>.
          </p>
          <textarea id="export-text" readOnly value={doc.text} spellCheck={false} style={{ width: '100%', minHeight: 260, fontFamily: 'var(--mono)', fontSize: 12, whiteSpace: 'pre', background: 'var(--panel-solid)', color: 'var(--text)', border: '1px solid var(--line-2)', borderRadius: 8, padding: 10 }} data-testid="export-text" />
        </div>
        <div className="modal-foot">
          {copied === 'ok' && <span className="hint" role="status" style={{ marginRight: 'auto', alignSelf: 'center' }}>Copied to the clipboard.</span>}
          {copied === 'select' && <span className="hint" role="status" style={{ marginRight: 'auto', alignSelf: 'center' }}>Text selected: use your device’s Copy command.</span>}
          <button className="btn" onClick={close}>
            Close
          </button>
          <button className="btn primary" onClick={copy} data-testid="export-copy">
            Copy
          </button>
        </div>
      </div>
    </div>
  );
}
