import type { ReactElement } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Layers } from '../render/Viewport';
import { STEP_SECONDS } from '../sim/config';
import { significantDuration } from '../sim/systems/earthquake';
import { stormParams } from '../sim/systems/weather';
import { DEFAULT_ENV, ENV_RANGES, SHOWCASE_QUAKE, builtinScenarios, describeCommand } from '../sim/scenario';
import { ASSET_KIND_NAMES, type CommandSpec, type EnvBase, type Scenario } from '../sim/types';
import {
  cancelCommand,
  deleteFromLibrary,
  exportResults,
  exportScenario,
  importScenarioFile,
  issue,
  loadLibrary,
  loadScenario,
  resetSimulation,
  saveToLibrary,
  currentScenario,
} from './actions';
import { compassName, fmtLocation, fmtTick } from './format';
import {
  IconChevronLeft,
  IconChevronRight,
  IconDownload,
  IconEdit,
  IconEvac,
  IconFire,
  IconFlood,
  IconFolder,
  IconGrid,
  IconLayers,
  IconQuake,
  IconRestart,
  IconSliders,
  IconStorm,
  IconTarget,
  IconTrash,
  IconUpload,
} from './icons';
import { runtime } from './runtime';
import { type LeftTab, type ToolKind, store, useUI } from './store';

const TOOLS: { id: ToolKind; label: string; icon: ReactElement; hint: string }[] = [
  { id: 'earthquake', label: 'Earthquake', icon: <IconQuake />, hint: 'Seismic rupture with site-amplified shaking, liquefaction and aftershocks' },
  { id: 'flood', label: 'Flood', icon: <IconFlood />, hint: 'Cloudburst, storm surge, levee breach or river flood wave' },
  { id: 'fire', label: 'Fire', icon: <IconFire />, hint: 'Ignite a block; spread depends on wind, fuel and moisture' },
  { id: 'storm', label: 'Storm', icon: <IconStorm />, hint: 'Cyclone with wind, rain, surge and lightning' },
  { id: 'infra', label: 'Infrastructure', icon: <IconGrid />, hint: 'Fail, trip or restore a facility or power line' },
  { id: 'evacuate', label: 'Evacuate', icon: <IconEvac />, hint: 'Issue an evacuation order around a point' },
];

export function Toolbox() {
  const open = useUI((s) => s.leftOpen);
  const tab = useUI((s) => s.leftTab);
  const tabs: { id: LeftTab; label: string; icon: ReactElement }[] = [
    { id: 'disasters', label: 'Disasters', icon: <IconQuake /> },
    { id: 'conditions', label: 'Conditions', icon: <IconSliders /> },
    { id: 'layers', label: 'Layers', icon: <IconLayers /> },
    { id: 'scenarios', label: 'Scenarios', icon: <IconFolder /> },
  ];
  return (
    <aside className={`side left panel chrome ${open ? '' : 'collapsed'}`} aria-label="Disaster toolbox" data-tour="toolbox">
      <div className="panel-head">
        <div className="tabs" role="tablist" aria-label="Toolbox sections">
          {tabs.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              title={t.label}
              onClick={() => store.set({ leftTab: t.id, leftOpen: true })}
              data-testid={`left-tab-${t.id}`}
            >
              {t.icon}
              <span>{t.label}</span>
            </button>
          ))}
        </div>
        <button className="icon-btn" aria-label={open ? 'Collapse toolbox' : 'Expand toolbox'} onClick={() => store.set({ leftOpen: !open })} title="Toggle toolbox ([)">
          {open ? <IconChevronLeft /> : <IconChevronRight />}
        </button>
      </div>
      <div className="panel-body" role="tabpanel">
        {tab === 'disasters' && <Disasters />}
        {tab === 'conditions' && <Conditions />}
        {tab === 'layers' && <LayersTab />}
        {tab === 'scenarios' && <Scenarios />}
      </div>
    </aside>
  );
}

// ------------------------------------------------------------------ disasters
interface ToolState {
  quake: { x: number; z: number; magnitude: number; depthKm: number; durationOverride: boolean; durationS: number; aftershocks: boolean };
  floodKind: 'rain' | 'surge' | 'levee_breach' | 'river_flood';
  rain: { rate: number; durationMin: number };
  surge: { height: number; durationMin: number };
  breach: { segment: number; width: number };
  river: { peak: number; durationMin: number };
  fire: { x: number; z: number; radius: number };
  storm: { category: number; dirDeg: number; durationMin: number; lightning: boolean };
  infra: { target: string; action: 'damage' | 'trip' | 'restore' };
  evac: { x: number; z: number; radius: number };
  delayMin: number;
}

const sq = SHOWCASE_QUAKE as Extract<CommandSpec, { kind: 'earthquake' }>;
let persisted: ToolState | null = null;

function defaults(): ToolState {
  const city = runtime.city;
  const ot = city?.districts[2];
  const ep = city?.districts[5];
  return {
    quake: { x: sq.x, z: sq.z, magnitude: 6.9, depthKm: 12, durationOverride: false, durationS: 20, aftershocks: true },
    floodKind: 'rain',
    rain: { rate: 60, durationMin: 60 },
    surge: { height: 3, durationMin: 120 },
    breach: { segment: 1, width: 2 },
    river: { peak: 900, durationMin: 120 },
    fire: { x: ot?.cx ?? -300, z: ot?.cz ?? 100, radius: 1 },
    storm: { category: 2, dirDeg: 200, durationMin: 120, lightning: true },
    infra: { target: 'asset:12', action: 'damage' },
    evac: { x: ep?.cx ?? 1200, z: ep?.cz ?? 500, radius: 700 },
    delayMin: 0,
  };
}

function Disasters() {
  const tool = useUI((s) => s.tool);
  const placing = useUI((s) => s.placing);
  const placeLoc = useUI((s) => s.placeLoc);
  const confirm = useUI((s) => s.confirmBranch);
  const status = useUI((s) => s.status);
  const [st, setSt] = useState<ToolState>(() => persisted ?? defaults());
  persisted = st;
  const lastLoc = useRef(placeLoc);

  // A map click while placing sets the location of the active tool.
  useEffect(() => {
    if (!placeLoc || placeLoc === lastLoc.current) return;
    lastLoc.current = placeLoc;
    setSt((s) => {
      if (tool === 'earthquake') return { ...s, quake: { ...s.quake, x: placeLoc.x, z: placeLoc.z } };
      if (tool === 'fire') return { ...s, fire: { ...s.fire, x: placeLoc.x, z: placeLoc.z } };
      if (tool === 'evacuate') return { ...s, evac: { ...s.evac, x: placeLoc.x, z: placeLoc.z } };
      return s;
    });
    store.set({ placing: false });
    runtime.viewport?.setPlacement(false);
  }, [placeLoc, tool]);

  const selectTool = (t: ToolKind) => {
    const next = tool === t ? null : t;
    store.set({ tool: next, placing: false, confirmBranch: false });
    runtime.viewport?.setPlacement(false);
    runtime.viewport?.hidePlacement();
    const loc = next === 'earthquake' ? st.quake : next === 'fire' ? st.fire : next === 'evacuate' ? st.evac : null;
    if (loc && Math.abs(loc.x) < 2100 && Math.abs(loc.z) < 2100) runtime.viewport?.showPlacement(loc.x, loc.z);
  };

  const pick = () => {
    const on = !placing;
    store.set({ placing: on });
    runtime.viewport?.setPlacement(on);
  };

  const spec = (): CommandSpec | null => {
    switch (tool) {
      case 'earthquake':
        return { kind: 'earthquake', x: st.quake.x, z: st.quake.z, magnitude: st.quake.magnitude, depthKm: st.quake.depthKm, aftershocks: st.quake.aftershocks, ...(st.quake.durationOverride ? { durationS: st.quake.durationS } : {}) };
      case 'flood':
        if (st.floodKind === 'rain') return { kind: 'rain', ...st.rain };
        if (st.floodKind === 'surge') return { kind: 'surge', ...st.surge };
        if (st.floodKind === 'levee_breach') return { kind: 'levee_breach', ...st.breach };
        return { kind: 'river_flood', ...st.river };
      case 'fire':
        return { kind: 'fire', ...st.fire };
      case 'storm':
        return { kind: 'storm', ...st.storm };
      case 'infra': {
        const [k, id] = st.infra.target.split(':');
        if (k === 'line') return { kind: 'line', lineId: Number(id), action: st.infra.action === 'restore' ? 'restore' : 'damage' };
        return { kind: 'asset', assetId: Number(id), action: st.infra.action };
      }
      case 'evacuate':
        return { kind: 'evacuate', ...st.evac };
      default:
        return null;
    }
  };

  const trigger = (force = false) => {
    const s = spec();
    if (!s) return;
    if (issue(s, st.delayMin, force)) {
      store.set({ tool: null, placing: false });
      runtime.viewport?.setPlacement(false);
      runtime.viewport?.hidePlacement();
    }
  };

  return (
    <>
      <div className="section">
        <div className="section-title">Disaster toolbox</div>
        <div className="tool-grid">
          {TOOLS.map((t) => (
            <button key={t.id} className="tool" aria-pressed={tool === t.id} onClick={() => selectTool(t.id)} title={t.hint} data-testid={`tool-${t.id}`}>
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>
        {!tool && <p className="hint" style={{ marginTop: 10 }}>Choose a hazard, set its parameters and location, then trigger it now or schedule it. Every trigger is recorded as a timestamped command, so replays are exact.</p>}
      </div>
      {tool && (
        <div className="section form" data-testid="tool-form">
          {tool === 'earthquake' && (
            <>
              <Location label="Epicentre" x={st.quake.x} z={st.quake.z} placing={placing} onPick={pick} offMapNote="offshore (south of map)" />
              <Slider label="Magnitude (Mw)" min={4} max={8.5} step={0.1} value={st.quake.magnitude} fmt={(v) => v.toFixed(1)} onChange={(v) => setSt({ ...st, quake: { ...st.quake, magnitude: v } })} testid="quake-magnitude" />
              <Slider label="Hypocentre depth" min={2} max={40} step={1} value={st.quake.depthKm} fmt={(v) => `${v} km`} onChange={(v) => setSt({ ...st, quake: { ...st.quake, depthKm: v } })} />
              <label className="check">
                <input type="checkbox" checked={st.quake.durationOverride} onChange={(e) => setSt({ ...st, quake: { ...st.quake, durationOverride: e.target.checked } })} />
                Override shaking duration (auto ≈ {significantDuration(st.quake.magnitude).toFixed(0)} s)
              </label>
              {st.quake.durationOverride && <Slider label="Strong shaking" min={3} max={120} step={1} value={st.quake.durationS} fmt={(v) => `${v} s`} onChange={(v) => setSt({ ...st, quake: { ...st.quake, durationS: v } })} />}
              <label className="check">
                <input type="checkbox" checked={st.quake.aftershocks} onChange={(e) => setSt({ ...st, quake: { ...st.quake, aftershocks: e.target.checked } })} />
                Generate aftershocks (Omori–Gutenberg–Richter)
              </label>
            </>
          )}
          {tool === 'flood' && (
            <>
              <div className="field">
                <label htmlFor="flood-kind">Flood mechanism</label>
                <select id="flood-kind" className="input" value={st.floodKind} onChange={(e) => setSt({ ...st, floodKind: e.target.value as ToolState['floodKind'] })}>
                  <option value="rain">Extreme rainfall (cloudburst)</option>
                  <option value="surge">Storm surge</option>
                  <option value="levee_breach">Levee breach</option>
                  <option value="river_flood">River flood wave</option>
                </select>
              </div>
              {st.floodKind === 'rain' && (
                <>
                  <Slider label="Intensity" min={5} max={200} step={5} value={st.rain.rate} fmt={(v) => `${v} mm/h`} onChange={(v) => setSt({ ...st, rain: { ...st.rain, rate: v } })} />
                  <Slider label="Duration" min={10} max={240} step={5} value={st.rain.durationMin} fmt={(v) => `${v} min`} onChange={(v) => setSt({ ...st, rain: { ...st.rain, durationMin: v } })} />
                </>
              )}
              {st.floodKind === 'surge' && (
                <>
                  <Slider label="Surge height" min={0.5} max={6} step={0.1} value={st.surge.height} fmt={(v) => `+${v.toFixed(1)} m`} onChange={(v) => setSt({ ...st, surge: { ...st.surge, height: v } })} />
                  <Slider label="Duration" min={20} max={300} step={10} value={st.surge.durationMin} fmt={(v) => `${v} min`} onChange={(v) => setSt({ ...st, surge: { ...st.surge, durationMin: v } })} />
                  <p className="hint">Seawall crest ≈ {(3.9 + (store.get().scenario?.resilience.leveeRaise ?? 0)).toFixed(1)} m above datum (before any settlement); tide adds up to ±0.45 m.</p>
                </>
              )}
              {st.floodKind === 'levee_breach' && (
                <>
                  <div className="field">
                    <label htmlFor="breach-seg">Levee segment</label>
                    <select id="breach-seg" className="input" value={st.breach.segment} onChange={(e) => setSt({ ...st, breach: { ...st.breach, segment: Number(e.target.value) } })}>
                      {runtime.city?.levees.map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <Slider label="Breach width" min={1} max={8} step={1} value={st.breach.width} fmt={(v) => `${v * 64} m`} onChange={(v) => setSt({ ...st, breach: { ...st.breach, width: v } })} />
                </>
              )}
              {st.floodKind === 'river_flood' && (
                <>
                  <Slider label="Peak discharge" min={100} max={4000} step={50} value={st.river.peak} fmt={(v) => `${v} m³/s`} onChange={(v) => setSt({ ...st, river: { ...st.river, peak: v } })} />
                  <Slider label="Duration" min={20} max={300} step={10} value={st.river.durationMin} fmt={(v) => `${v} min`} onChange={(v) => setSt({ ...st, river: { ...st.river, durationMin: v } })} />
                </>
              )}
            </>
          )}
          {tool === 'fire' && (
            <>
              <Location label="Ignition point" x={st.fire.x} z={st.fire.z} placing={placing} onPick={pick} />
              <Slider label="Initial size" min={0} max={3} step={1} value={st.fire.radius} fmt={(v) => `${(v * 2 + 1) * 32} m block`} onChange={(v) => setSt({ ...st, fire: { ...st.fire, radius: v } })} />
              <p className="hint">Spread follows the simulated wind, fuel load and moisture. Crews respond over open roads; lost water pressure cuts suppression to ~35 %.</p>
            </>
          )}
          {tool === 'storm' && (
            <>
              <Slider label="Category" min={0} max={5} step={1} value={st.storm.category} fmt={(v) => (v === 0 ? 'Tropical storm' : `Cat ${v}`)} onChange={(v) => setSt({ ...st, storm: { ...st.storm, category: v } })} />
              <p className="hint">
                Peak over land: rain {stormParams(st.storm.category).rainPeak} mm/h · wind {stormParams(st.storm.category).windPeak} m/s · surge +{stormParams(st.storm.category).surgePeak.toFixed(1)} m
              </p>
              <Slider label="Approach (wind from)" min={0} max={359} step={5} value={st.storm.dirDeg} fmt={(v) => `${v}° ${compassName(v)}`} onChange={(v) => setSt({ ...st, storm: { ...st.storm, dirDeg: v } })} />
              <Slider label="Duration" min={30} max={300} step={10} value={st.storm.durationMin} fmt={(v) => `${v} min`} onChange={(v) => setSt({ ...st, storm: { ...st.storm, durationMin: v } })} />
              <label className="check">
                <input type="checkbox" checked={st.storm.lightning} onChange={(e) => setSt({ ...st, storm: { ...st.storm, lightning: e.target.checked } })} />
                Lightning (strikes can ignite fuel and trip substations)
              </label>
            </>
          )}
          {tool === 'infra' && <InfraPicker st={st} setSt={setSt} />}
          {tool === 'evacuate' && (
            <>
              <Location label="Order centre" x={st.evac.x} z={st.evac.z} placing={placing} onPick={pick} />
              <Slider label="Radius" min={150} max={2500} step={50} value={st.evac.radius} fmt={(v) => `${v} m`} onChange={(v) => setSt({ ...st, evac: { ...st.evac, radius: v } })} />
              <p className="hint">Residents with working mobile coverage are alerted immediately; elsewhere the order spreads by word of mouth.</p>
            </>
          )}
          <Slider label="Timing" min={0} max={60} step={1} value={st.delayMin} fmt={(v) => (v === 0 ? 'Now' : `In ${v} min (${fmtTick((status?.tick ?? 0) + (v * 60) / STEP_SECONDS)})`)} onChange={(v) => setSt({ ...st, delayMin: v })} />
          {confirm ? (
            <div className="warn-note" role="alert">
              You are replaying the past ({fmtTick(status?.tick ?? 0)}). Triggering here starts a new branch and discards the recorded future.
              <div className="btn-row" style={{ marginTop: 8 }}>
                <button className="btn danger small" onClick={() => trigger(true)} data-testid="confirm-branch">
                  Branch &amp; trigger
                </button>
                <button className="btn small" onClick={() => store.set({ confirmBranch: false })}>
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button className="btn primary block" onClick={() => trigger()} data-testid="trigger">
              {st.delayMin > 0 ? 'Schedule' : 'Trigger'} {TOOLS.find((t) => t.id === tool)?.label.toLowerCase()}
            </button>
          )}
        </div>
      )}
      <Scheduled />
    </>
  );
}

function InfraPicker({ st, setSt }: { st: ToolState; setSt: (s: ToolState) => void }) {
  const city = runtime.city;
  const sel = useUI((s) => s.selection);
  useEffect(() => {
    if (sel?.kind === 'asset') setSt({ ...st, infra: { ...st.infra, target: `asset:${sel.id}` } });
    if (sel?.kind === 'line') setSt({ ...st, infra: { ...st.infra, target: `line:${sel.id}` } });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sel]);
  const groups = useMemo(() => {
    const g = new Map<string, { id: number; name: string }[]>();
    for (const a of city?.assets ?? []) {
      const k = ASSET_KIND_NAMES[a.kind];
      if (!g.has(k)) g.set(k, []);
      g.get(k)!.push({ id: a.id, name: a.name });
    }
    return [...g.entries()];
  }, [city]);
  const isLine = st.infra.target.startsWith('line:');
  return (
    <>
      <div className="field">
        <label htmlFor="infra-target">Target (or click a facility on the map)</label>
        <select id="infra-target" className="input" value={st.infra.target} onChange={(e) => setSt({ ...st, infra: { ...st.infra, target: e.target.value } })}>
          {groups.map(([k, list]) => (
            <optgroup key={k} label={k}>
              {list.map((a) => (
                <option key={a.id} value={`asset:${a.id}`}>
                  {a.name}
                </option>
              ))}
            </optgroup>
          ))}
          <optgroup label="Power lines">
            {city?.lines.map((l) => (
              <option key={l.id} value={`line:${l.id}`}>
                {l.name}
              </option>
            ))}
          </optgroup>
        </select>
      </div>
      <div className="seg" role="group" aria-label="Action">
        {(['damage', 'trip', 'restore'] as const)
          .filter((a) => !isLine || a !== 'trip')
          .map((a) => (
            <button key={a} aria-pressed={st.infra.action === a} onClick={() => setSt({ ...st, infra: { ...st.infra, action: a } })}>
              {a === 'damage' ? 'Fail' : a === 'trip' ? 'Trip 10 min' : 'Restore'}
            </button>
          ))}
      </div>
      <p className="hint">Failures propagate through the dependency graph: substations feed pumps, hospitals, telecom and water; the telecom exchange feeds every cell tower.</p>
    </>
  );
}

function Scheduled() {
  const status = useUI((s) => s.status);
  void useUI((s) => s.eventsVersion);
  const cmds = runtime.client.commands.filter((c) => c.tick >= (status?.tick ?? 0));
  if (!cmds.length) return null;
  const nameOf = (id: number) => runtime.city?.assets[id]?.name ?? `#${id}`;
  return (
    <div className="section">
      <div className="section-title">Scheduled</div>
      <ul className="sched">
        {cmds.slice(0, 12).map((c) => (
          <li key={c.id}>
            <span className="t">{fmtTick(c.tick)}</span>
            <span style={{ flex: 1 }}>{describeCommand(c.spec, nameOf)}</span>
            <button className="icon-btn" style={{ width: 24, height: 24 }} aria-label="Cancel scheduled command" onClick={() => cancelCommand(c.id)}>
              <IconTrash size={13} />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Location({ label, x, z, placing, onPick, offMapNote }: { label: string; x: number; z: number; placing: boolean; onPick: () => void; offMapNote?: string }) {
  const off = Math.abs(x) > 2048 || Math.abs(z) > 2048;
  return (
    <div className="field">
      <span className="lbl">{label}</span>
      <div className={`loc ${placing ? 'active' : ''}`}>
        <IconTarget size={15} />
        <span className="num" style={{ flex: 1 }}>
          {placing ? 'Click on the map…' : `${fmtLocation(x, z)}${off && offMapNote ? ` · ${offMapNote}` : ''}`}
        </span>
        <button className="btn small" onClick={onPick} data-testid="pick-location">
          {placing ? 'Cancel' : 'Pick on map'}
        </button>
      </div>
    </div>
  );
}

export function Slider({ label, min, max, step, value, fmt, onChange, testid }: { label: string; min: number; max: number; step: number; value: number; fmt: (v: number) => string; onChange: (v: number) => void; testid?: string }) {
  const id = `sl-${label.replace(/\W+/g, '-')}`;
  return (
    <div className="field">
      <div className="field-row">
        <label htmlFor={id}>{label}</label>
        <span className="val">{fmt(value)}</span>
      </div>
      <input id={id} type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} data-testid={testid} />
    </div>
  );
}

// ------------------------------------------------------------------ conditions
function Conditions() {
  const scenario = useUI((s) => s.scenario);
  void useUI((s) => s.status);
  const eff = runtime.client.frame?.eff;
  const [env, setEnv] = useState<EnvBase>(() => ({ ...(scenario?.env ?? DEFAULT_ENV) }));
  const fields: { k: keyof EnvBase; label: string; unit: string; step: number; fmt?: (v: number) => string }[] = [
    { k: 'rainfall', label: 'Rainfall', unit: 'mm/h', step: 0.5 },
    { k: 'windSpeed', label: 'Wind speed', unit: 'm/s', step: 1 },
    { k: 'windDir', label: 'Wind from', unit: '°', step: 5, fmt: (v) => `${v.toFixed(0)}° ${compassName(v)}` },
    { k: 'temperature', label: 'Temperature', unit: '°C', step: 1 },
    { k: 'seaLevel', label: 'Sea level (datum offset)', unit: 'm', step: 0.1, fmt: (v) => `${v >= 0 ? '+' : ''}${v.toFixed(1)} m` },
    { k: 'soilSaturation', label: 'Soil saturation', unit: '', step: 0.05, fmt: (v) => `${Math.round(v * 100)} %` },
  ];
  return (
    <>
      <div className="section">
        <div className="section-title">Base conditions</div>
        <div className="form" style={{ marginTop: 0 }}>
          {fields.map((f) => (
            <Slider key={f.k} label={f.label} min={ENV_RANGES[f.k][0]} max={f.k === 'windDir' ? 359 : ENV_RANGES[f.k][1]} step={f.step} value={env[f.k]} fmt={f.fmt ?? ((v) => `${v.toFixed(f.step < 1 ? 1 : 0)} ${f.unit}`)} onChange={(v) => setEnv({ ...env, [f.k]: v })} />
          ))}
          <button className="btn primary block" onClick={() => issue({ kind: 'env', env: { ...env } })} data-testid="apply-conditions">
            Apply conditions now
          </button>
          <p className="hint">Changes are recorded as a timestamped command so replays stay deterministic. Storms and rain bursts add on top of these base values.</p>
        </div>
      </div>
      {eff && (
        <div className="section">
          <div className="section-title">Effective now</div>
          <dl className="props">
            <dt>Rainfall</dt>
            <dd>{eff.rainfall.toFixed(1)} mm/h</dd>
            <dt>Wind (gust)</dt>
            <dd>
              {eff.windSpeed.toFixed(1)} ({eff.gust.toFixed(0)}) m/s from {compassName(eff.windDir)}
            </dd>
            <dt>Sea surface</dt>
            <dd>
              {eff.seaSurface.toFixed(2)} m (tide {eff.tide.toFixed(2)}, surge {eff.surge.toFixed(2)})
            </dd>
            <dt>River discharge</dt>
            <dd>{eff.riverQ.toFixed(0)} m³/s</dd>
            <dt>Cloud cover</dt>
            <dd>{Math.round(eff.cloudCover * 100)} %</dd>
            <dt>Lightning rate</dt>
            <dd>{eff.lightningRate.toFixed(2)} / min</dd>
            <dt>Visibility</dt>
            <dd>{eff.visibilityKm.toFixed(1)} km</dd>
          </dl>
        </div>
      )}
    </>
  );
}

// ------------------------------------------------------------------ layers
const LAYER_INFO: { k: keyof Layers; label: string; desc: string }[] = [
  { k: 'population', label: 'Population', desc: 'Citizen agents coloured by behaviour; emergency crews' },
  { k: 'flood', label: 'Flooding', desc: 'Depth colormap with 0.5 m contours on floodwater' },
  { k: 'fire', label: 'Fire', desc: 'Fire intensity field on the ground' },
  { k: 'damage', label: 'Damage', desc: 'Buildings and blocks tinted by damage state' },
  { k: 'power', label: 'Power', desc: 'Energised service areas, lines and facility status rings' },
  { k: 'roads', label: 'Roads', desc: 'Open / congested / closed road segments' },
  { k: 'weather', label: 'Weather', desc: 'Cloud deck and rain particles' },
  { k: 'shaking', label: 'Shaking', desc: 'Peak ground motion as MMI (live pulses when shaking)' },
  { k: 'soil', label: 'Soil / liquefaction', desc: 'Soft-soil susceptibility and settlement' },
  { k: 'labels', label: 'Labels', desc: 'Names and status of critical facilities' },
];

function LayersTab() {
  const layers = useUI((s) => s.layers);
  const toggle = (k: keyof Layers) => {
    const next = { ...layers, [k]: !layers[k] };
    // ground overlays are mutually exclusive for readability
    const exclusive: (keyof Layers)[] = ['shaking', 'fire', 'soil', 'damage', 'power'];
    if (next[k] && exclusive.includes(k)) for (const o of exclusive) if (o !== k) next[o] = false;
    store.set({ layers: next });
    runtime.viewport?.setLayers(next);
  };
  return (
    <div className="section">
      <div className="section-title">Map layers</div>
      <div className="layer-list">
        {LAYER_INFO.map((l) => (
          <button key={l.k} className="layer" aria-pressed={layers[l.k]} onClick={() => toggle(l.k)} data-testid={`layer-${l.k}`}>
            <span className="sw" aria-hidden="true" />
            <span>
              <b>{l.label}</b>
              <small>{l.desc}</small>
            </span>
          </button>
        ))}
      </div>
      <div className="btn-row" style={{ marginTop: 10 }}>
        <button className="btn small" onClick={() => runtime.viewport?.overview()}>
          Overview (O)
        </button>
        <button className="btn small" onClick={() => runtime.viewport?.topDown()}>
          Top-down (P)
        </button>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ scenarios
function Scenarios() {
  const scenario = useUI((s) => s.scenario);
  const [lib, setLib] = useState<Scenario[]>(() => loadLibrary());
  const [name, setName] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const builtins = useMemo(() => builtinScenarios(), []);
  const save = () => {
    const cur = currentScenario();
    if (!cur) return;
    const saved = saveToLibrary({ ...cur, name: name.trim() || `${cur.name} (saved)`, bookmarks: scenario?.bookmarks ?? [], id: cur.builtin ? 'x' : cur.id });
    setLib(loadLibrary());
    setMsg(`Saved “${saved.name}” to this browser.`);
    setName('');
  };
  return (
    <>
      <div className="section">
        <div className="section-title">Current scenario</div>
        <div className="note">
          <b style={{ display: 'block', color: 'var(--text)' }}>{scenario?.name}</b>
          {scenario?.description}
          <div className="muted" style={{ marginTop: 4 }}>
            Seed {scenario?.seed} · {(scenario?.agents ?? 0) * 100 /* PEOPLE_PER_AGENT */} residents · {scenario?.durationMin} min
          </div>
        </div>
        <div className="btn-row" style={{ marginTop: 8 }}>
          <button className="btn small" onClick={() => store.set({ showEditor: true })} data-testid="open-editor">
            <IconEdit size={14} /> Edit scenario
          </button>
          <button className="btn small" onClick={() => resetSimulation()} title="Restart from T+0 keeping all issued commands">
            <IconRestart size={14} /> Restart
          </button>
        </div>
      </div>
      <div className="section">
        <div className="section-title">Save to library</div>
        <div style={{ display: 'flex', gap: 6 }}>
          <input type="text" placeholder="Scenario name" value={name} onChange={(e) => setName(e.target.value)} aria-label="Name for saved scenario" data-testid="save-name" />
          <button className="btn small" onClick={save} data-testid="save-scenario">
            Save
          </button>
        </div>
        {msg && <p className="hint" role="status">{msg}</p>}
      </div>
      <div className="section">
        <div className="section-title">Built-in scenarios</div>
        <div className="scn">
          {builtins.map((b) => (
            <div key={b.id} className={`scn-item ${scenario?.id === b.id ? 'current' : ''}`}>
              <div className="meta">
                <b>{b.name}</b>
                <small>{b.commands.length ? `${b.commands.length} scheduled event${b.commands.length > 1 ? 's' : ''}` : 'no events'} · {b.durationMin} min</small>
              </div>
              <button className="btn small" onClick={() => loadScenario(b)} data-testid={`load-${b.id}`}>
                Load
              </button>
            </div>
          ))}
        </div>
      </div>
      <div className="section">
        <div className="section-title">Saved in this browser</div>
        {!lib.length && <p className="hint">Nothing saved yet.</p>}
        <div className="scn">
          {lib.map((b) => (
            <div key={b.id} className={`scn-item ${scenario?.id === b.id ? 'current' : ''}`}>
              <div className="meta">
                <b>{b.name}</b>
                <small>{b.commands.length} events · seed {b.seed}</small>
              </div>
              <button className="btn small" onClick={() => loadScenario(b)} data-testid={`load-saved-${b.name}`}>
                Load
              </button>
              <button
                className="icon-btn"
                style={{ width: 28, height: 28 }}
                aria-label={`Delete ${b.name}`}
                onClick={() => {
                  deleteFromLibrary(b.id);
                  setLib(loadLibrary());
                }}
              >
                <IconTrash size={14} />
              </button>
            </div>
          ))}
        </div>
      </div>
      <div className="section">
        <div className="section-title">Files</div>
        <div className="btn-row">
          <button className="btn small" onClick={() => exportScenario()}>
            <IconDownload size={14} /> Export scenario
          </button>
          <button className="btn small" onClick={() => fileRef.current?.click()}>
            <IconUpload size={14} /> Import
          </button>
          <button className="btn small" onClick={() => exportResults('json')}>
            <IconDownload size={14} /> Results
          </button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          style={{ display: 'none' }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            importScenarioFile(f).then((errors) => {
              setLib(loadLibrary());
              setMsg(errors.length ? `Imported with ${errors.length} warning(s): ${errors.slice(0, 2).join('; ')}` : `Imported “${f.name}”.`);
            });
            e.target.value = '';
          }}
        />
      </div>
    </>
  );
}
