import { useEffect, useMemo, useRef, useState } from 'react';
import { SPEEDS, STEP_SECONDS } from '../sim/config';
import { describeCommand } from '../sim/scenario';
import { addBookmark, goLive, removeBookmark, seek, seekRelative, selectEvent, setSpeed, togglePlay } from './actions';
import { CATEGORY, SEVERITY, fmtTick } from './format';
import { IconBack, IconBookmark, IconFwd, IconLive, IconPause, IconPlay, IconRestart } from './icons';
import { runtime } from './runtime';
import { store, useUI } from './store';

export function Timeline() {
  const status = useUI((s) => s.status);
  const eventsVersion = useUI((s) => s.eventsVersion);
  const scenario = useUI((s) => s.scenario);
  const trackRef = useRef<HTMLDivElement>(null);
  const footer = useRef<HTMLElement>(null);
  // side panels and overlays sit above the timeline, whose height varies (it wraps on phones)
  useEffect(() => {
    const el = footer.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => document.documentElement.style.setProperty('--tl-real', `${Math.ceil(el.getBoundingClientRect().height)}px`));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const [drag, setDrag] = useState<number | null>(null);
  const [hover, setHover] = useState<{ x: number; text: string } | null>(null);
  const lastSeek = useRef(0);
  const max = Math.max(1, status?.maxTicks ?? runtime.client.maxTicks ?? 1);
  const tick = drag ?? status?.tick ?? 0;
  const frontier = status?.frontier ?? 0;
  const pct = (t: number) => `${(Math.min(max, Math.max(0, t)) / max) * 100}%`;

  const markers = useMemo(() => {
    void eventsVersion;
    return runtime.client.events.filter((e) => e.severity >= 2 && e.type !== 'lightning').slice(-400);
  }, [eventsVersion]);
  const future = runtime.client.commands.filter((c) => c.tick >= (status?.tick ?? 0));

  const tickAt = (clientX: number) => {
    const r = trackRef.current!.getBoundingClientRect();
    return Math.round(Math.min(1, Math.max(0, (clientX - r.left) / r.width)) * max);
  };
  const onDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('.mk, .bm')) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const t = tickAt(e.clientX);
    setDrag(t);
    seek(t);
    lastSeek.current = performance.now();
  };
  const onMove = (e: React.PointerEvent) => {
    const t = tickAt(e.clientX);
    const r = trackRef.current!.getBoundingClientRect();
    setHover({ x: e.clientX - r.left, text: fmtTick(t) });
    if (drag === null) return;
    setDrag(t);
    if (performance.now() - lastSeek.current > 140) {
      seek(t);
      lastSeek.current = performance.now();
    }
  };
  const onUp = (e: React.PointerEvent) => {
    if (drag === null) return;
    seek(tickAt(e.clientX));
    setDrag(null);
  };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowLeft') seekRelative(e.shiftKey ? -10 : -1);
    else if (e.key === 'ArrowRight') seekRelative(e.shiftKey ? 10 : 1);
    else return;
    e.preventDefault();
    e.stopPropagation();
  };

  const hours = [];
  const totalMin = (max * STEP_SECONDS) / 60;
  const stepMin = totalMin > 240 ? 60 : totalMin > 90 ? 30 : 15;
  for (let m = stepMin; m < totalMin; m += stepMin) hours.push(m);

  return (
    <footer className="timeline panel chrome keep" aria-label="Simulation timeline" data-tour="timeline" ref={footer}>
      <div className="transport">
        <button className="icon-btn" aria-label="Restart from the beginning" onClick={() => seek(0)} title="Jump to start (Home)">
          <IconRestart />
        </button>
        <button className="icon-btn" aria-label="Back one minute" onClick={() => seekRelative(-1)} title="Back 1 min (←, Shift+← 10 min)">
          <IconBack />
        </button>
        <button className="play" aria-label={status?.playing ? 'Pause' : 'Play'} onClick={togglePlay} title="Play / pause (Space)" data-testid="play-toggle">
          {status?.playing ? <IconPause size={18} /> : <IconPlay size={18} />}
        </button>
        <button className="icon-btn" aria-label="Forward one minute" onClick={() => seekRelative(1)} title="Forward 1 min (→)">
          <IconFwd />
        </button>
        <button className="icon-btn" aria-label="Jump to live edge" onClick={goLive} title="Jump to the live edge (End)" disabled={!status?.replay}>
          <IconLive />
        </button>
      </div>
      <div className="seg speeds" role="group" aria-label="Playback speed">
        {SPEEDS.map((s, i) => (
          <button key={s} aria-pressed={status?.speed === s} onClick={() => setSpeed(s)} title={`${s}× (key ${i + 1}) = ${((s * 30) / 60).toFixed(s < 1 ? 2 : 1)} simulated min per second`} data-testid={`speed-${s}`}>
            {s}×
          </button>
        ))}
      </div>
      <button
        className="speed-cycle"
        onClick={() => setSpeed(SPEEDS[(SPEEDS.indexOf((status?.speed ?? 1) as (typeof SPEEDS)[number]) + 1) % SPEEDS.length])}
        aria-label={`Playback speed ${status?.speed ?? 1}×, tap for the next speed`}
        data-testid="speed-cycle"
      >
        {status?.speed ?? 1}×
      </button>
      <div className="tl-mid">
        <div className="tl-info">
          <b className="num" data-testid="tl-time">{fmtTick(tick)}</b>
          <span className="tl-max">/ {fmtTick(max)}</span>
          {status?.replay ? (
            <span className="replay-note" data-testid="replay-note" title="Seeking restores the nearest keyframe and re-runs the deterministic simulation; checksums are compared at every recorded keyframe.">
              ◷ Replay: deterministic re-simulation · {status.verified} keyframe{status.verified === 1 ? '' : 's'} verified{status.mismatches ? ` · ${status.mismatches} MISMATCH` : ' ✓'}
            </span>
          ) : (
            <span className="muted rec">recorded to {fmtTick(frontier)}</span>
          )}
          <span className="spacer" />
          <button className="btn small" onClick={() => addBookmark()} title="Bookmark this moment (B)" data-testid="add-bookmark">
            <IconBookmark size={13} /> <span className="lbl">Bookmark</span>
          </button>
        </div>
        <div
          className="track"
          ref={trackRef}
          role="slider"
          tabIndex={0}
          aria-label="Simulation time"
          aria-valuemin={0}
          aria-valuemax={max}
          aria-valuenow={tick}
          aria-valuetext={fmtTick(tick)}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerLeave={() => setHover(null)}
          onKeyDown={onKey}
          data-testid="timeline-track"
        >
          <div className="rail" />
          <div className="rec" style={{ width: pct(frontier) }} />
          {hours.map((m) => (
            <span key={m} className="hour" style={{ left: pct((m * 60) / STEP_SECONDS) }}>
              {Math.floor(m / 60)}:{String(m % 60).padStart(2, '0')}
            </span>
          ))}
          {markers.map((e) => (
            <button
              key={e.id}
              className={`mk s${e.severity} ${e.tick > (status?.tick ?? 0) ? 'future' : ''}`}
              style={{ left: pct(e.tick), background: CATEGORY[e.category]?.color ?? '#888' }}
              aria-label={`${SEVERITY[e.severity]} ${CATEGORY[e.category]?.label ?? ''} event at ${fmtTick(e.tick)}: ${e.title}`}
              title={`${fmtTick(e.tick)} · ${e.title}`}
              onClick={(ev) => {
                ev.stopPropagation();
                seek(e.tick + 1);
                store.set({ rightTab: 'events' });
                selectEvent(e.id);
              }}
            />
          ))}
          {future.map((c) => (
            <span key={`c${c.id}`} className="mk future" style={{ left: pct(c.tick), pointerEvents: 'none' }} title={`Scheduled: ${describeCommand(c.spec)}`} />
          ))}
          {scenario?.bookmarks.map((b) => (
            <button
              key={`b${b.tick}`}
              className="bm"
              style={{ left: pct(b.tick) }}
              aria-label={`Bookmark ${b.label} at ${fmtTick(b.tick)}. Click to jump, right-click to remove.`}
              onClick={(ev) => {
                ev.stopPropagation();
                seek(b.tick);
              }}
              onContextMenu={(ev) => {
                ev.preventDefault();
                removeBookmark(b.tick);
              }}
            >
              <span>{b.label}</span>
            </button>
          ))}
          <div className="head" style={{ left: pct(tick) }} />
          {hover && drag === null && (
            <div className="tip" style={{ position: 'absolute', left: hover.x, top: -24, transform: 'translateX(-50%)', fontSize: 10.5, background: '#0b0f15', border: '1px solid var(--line-2)', borderRadius: 5, padding: '1px 6px', pointerEvents: 'none', whiteSpace: 'nowrap' }}>
              {hover.text}
            </div>
          )}
        </div>
      </div>
    </footer>
  );
}
