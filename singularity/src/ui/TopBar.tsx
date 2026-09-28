import { useState } from 'react';
import type { QualityLevel } from '../render/quality';
import { STEP_SECONDS } from '../sim/config';
import { exportResults, exportScenario } from './actions';
import { compassName, fmtClock, fmtTimeOfDay } from './format';
import { IconActivity, IconDownload, IconDrop, IconEye, IconFilm, IconHelp, IconInfo, IconThermo, IconWave, IconWind } from './icons';
import { runtime } from './runtime';
import { store, useUI } from './store';

export function TopBar() {
  const status = useUI((s) => s.status);
  const metrics = useUI((s) => s.metrics);
  const scenario = useUI((s) => s.scenario);
  const cinematic = useUI((s) => s.cinematic);
  const quality = useUI((s) => s.quality);
  const autoQ = useUI((s) => s.autoQuality);
  const diag = useUI((s) => s.diagnostics);
  const [menu, setMenu] = useState(false);
  const frame = runtime.client.frame;
  const eff = frame?.eff;
  const t = (status?.tick ?? 0) * STEP_SECONDS;
  let pill = { cls: 'paused', text: 'PAUSED' };
  if (status?.seeking) pill = { cls: 'replay', text: 'SEEKING' };
  else if (status?.ended) pill = { cls: 'ended', text: 'ENDED' };
  else if (status?.replay) pill = { cls: 'replay', text: status.playing ? 'REPLAY' : 'REPLAY · PAUSED' };
  else if (status?.playing) pill = { cls: 'live', text: 'LIVE' };

  return (
    <header className="topbar chrome keep" role="banner">
      <div className="brand">
        <div className="brand-mark" aria-hidden="true" />
        <div style={{ minWidth: 0 }}>
          <div className="brand-name">SINGULARITY</div>
          <div className="brand-sub" title={scenario?.name}>
            Meridian Bay · {scenario?.name ?? 'loading…'}
          </div>
        </div>
      </div>
      <div className="divider" />
      <span className={`status-pill ${pill.cls}`} role="status" aria-live="polite" data-testid="sim-status">
        <span className="dot" />
        {pill.text}
      </span>
      <div className="clock" title="Simulated time since scenario start · local time of day">
        <b data-testid="sim-clock">T+{fmtClock(t)}</b>
        <span>
          {eff ? fmtTimeOfDay(eff.timeOfDay) : '--:--'} local · {status ? `${status.speed}×` : ''}
        </span>
      </div>
      <div className="divider hide-sm" />
      <div className="env" aria-label="Current conditions">
        <span className="chip" title="Rainfall (effective, including storms and bursts)">
          <IconDrop size={13} />
          <span className="num">{eff ? eff.rainfall.toFixed(1) : '—'}</span>
          <span className="k">mm/h</span>
        </span>
        <span className="chip" title={`Wind from ${eff ? compassName(eff.windDir) : ''}, gusts ${eff ? eff.gust.toFixed(0) : '—'} m/s`}>
          <IconWind size={13} />
          <svg width="12" height="12" viewBox="0 0 12 12" style={{ transform: `rotate(${(eff?.windDir ?? 0) + 180}deg)` }} aria-hidden="true">
            <path d="M6 1l3 8-3-2-3 2z" fill="currentColor" />
          </svg>
          <span className="num">{eff ? eff.windSpeed.toFixed(0) : '—'}</span>
          <span className="k">m/s</span>
        </span>
        <span className="chip opt" title="Air temperature">
          <IconThermo size={13} />
          <span className="num">{eff ? eff.temperature.toFixed(0) : '—'}</span>
          <span className="k">°C</span>
        </span>
        <span className="chip" title={`Sea level = datum ${eff ? eff.seaLevel.toFixed(2) : ''} + tide ${eff ? eff.tide.toFixed(2) : ''} + surge ${eff ? eff.surge.toFixed(2) : ''} m`}>
          <IconWave size={13} />
          <span className="num">{eff ? (eff.seaSurface >= 0 ? '+' : '') + eff.seaSurface.toFixed(2) : '—'}</span>
          <span className="k">m sea</span>
        </span>
        <span className="chip opt" title="Visibility (rain, storm and smoke)">
          <IconEye size={13} />
          <span className="num">{eff ? eff.visibilityKm.toFixed(1) : '—'}</span>
          <span className="k">km</span>
        </span>
        {metrics && metrics.affected > 0 && (
          <span className="chip opt wide-only" title="Residents exposed to damaging hazard intensity so far">
            <span className="k">affected</span>
            <span className="num">{metrics.affected < 1000 ? metrics.affected : metrics.affected < 1e5 ? `${(metrics.affected / 1000).toFixed(1)}k` : `${Math.round(metrics.affected / 1000)}k`}</span>
          </span>
        )}
      </div>
      <div className="spacer" />
      <div className="seg" role="group" aria-label="View mode">
        <button className="analytical" aria-pressed={!cinematic} onClick={() => setMode(false)} title="Analytical mode: panels, overlays, free orbit camera">
          Analytical
        </button>
        <button aria-pressed={cinematic} onClick={() => setMode(!cinematic)} title="Cinematic mode: automatic event-focused camera (C)" aria-label="Cinematic mode">
          <IconFilm size={13} style={{ verticalAlign: -2, marginRight: 4 }} />
          <span className="lbl">Cinematic</span>
        </button>
      </div>
      <select
        className="compact hide-sm"
        aria-label="Render quality"
        value={autoQ ? 'auto' : quality}
        onChange={(e) => {
          const v = e.target.value;
          if (v === 'auto') {
            runtime.viewport?.setAutoQuality(true);
            store.set({ autoQuality: true });
          } else {
            runtime.viewport?.setQuality(v as QualityLevel);
            store.set({ quality: v as QualityLevel, autoQuality: false });
          }
        }}
        title="Rendering quality (Auto adapts to frame rate)"
      >
        <option value="auto">Auto ({quality})</option>
        <option value="ultra">Ultra</option>
        <option value="high">High</option>
        <option value="medium">Medium</option>
        <option value="low">Low</option>
      </select>
      <div style={{ position: 'relative' }}>
        <button className="icon-btn" aria-label="Export results" aria-expanded={menu} onClick={() => setMenu(!menu)} title="Export simulation summary">
          <IconDownload />
        </button>
        {menu && (
          <div className="panel" style={{ position: 'absolute', right: 0, top: 38, padding: 6, width: 230, display: 'flex', flexDirection: 'column', gap: 4, zIndex: 40 }} onMouseLeave={() => setMenu(false)}>
            <button className="btn small" onClick={() => (exportResults('json'), setMenu(false))}>
              Summary (JSON)
            </button>
            <button className="btn small" onClick={() => (exportResults('metrics'), setMenu(false))}>
              Metrics time series (CSV)
            </button>
            <button className="btn small" onClick={() => (exportResults('events'), setMenu(false))}>
              Event log with causes (CSV)
            </button>
            <button className="btn small" onClick={() => (exportScenario(), setMenu(false))}>
              Scenario definition (JSON)
            </button>
          </div>
        )}
      </div>
      <button className="icon-btn hide-sm" aria-label="Diagnostics" aria-pressed={diag} onClick={() => store.set({ diagnostics: !diag })} title="Developer diagnostics (G)">
        <IconActivity />
      </button>
      <button className="icon-btn hide-sm" aria-label="Model notes and limitations" onClick={() => store.set({ showNotes: true })} title="How the models work and their limitations">
        <IconInfo />
      </button>
      <button className="icon-btn" aria-label="Guided tour" onClick={() => store.set({ tourStep: 0 })} title="Guided tour (H)">
        <IconHelp />
      </button>
    </header>
  );
}

export function setMode(cinematic: boolean) {
  runtime.viewport?.setCinematic(cinematic);
  store.set({ cinematic, caption: null });
}
