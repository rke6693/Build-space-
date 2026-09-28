import { useState } from 'react';
import { MAX_AGENTS, STEP_SECONDS } from '../sim/config';
import { ENV_RANGES, cloneScenario, describeCommand, validateCommandSpec, validateScenario } from '../sim/scenario';
import type { Command, CommandSpec, EnvBase, Scenario } from '../sim/types';
import { currentScenario, loadScenario, saveToLibrary } from './actions';
import { IconClose, IconPlus, IconTrash } from './icons';
import { runtime } from './runtime';
import { store, useUI } from './store';

const ENV_LABELS: Record<keyof EnvBase, string> = {
  rainfall: 'Rainfall (mm/h)',
  windSpeed: 'Wind speed (m/s)',
  windDir: 'Wind from (° from north)',
  temperature: 'Temperature (°C)',
  seaLevel: 'Sea level offset (m)',
  soilSaturation: 'Soil saturation (0–1)',
};

const NEW_SPECS: Record<string, CommandSpec> = {
  earthquake: { kind: 'earthquake', x: 900, z: 5600, magnitude: 6.5, depthKm: 12, aftershocks: true },
  rain: { kind: 'rain', rate: 50, durationMin: 60 },
  surge: { kind: 'surge', height: 2.5, durationMin: 120 },
  levee_breach: { kind: 'levee_breach', segment: 1, width: 2 },
  river_flood: { kind: 'river_flood', peak: 900, durationMin: 120 },
  fire: { kind: 'fire', x: -300, z: 100, radius: 1 },
  storm: { kind: 'storm', category: 2, dirDeg: 200, durationMin: 120, lightning: true },
  asset: { kind: 'asset', assetId: 12, action: 'damage' },
  evacuate: { kind: 'evacuate', x: 1200, z: 500, radius: 700 },
};

export function ScenarioEditor() {
  const open = useUI((s) => s.showEditor);
  if (!open) return null;
  return <EditorBody />;
}

function EditorBody() {
  const base = store.get().scenario;
  const [s, setS] = useState<Scenario>(() => {
    const cur = currentScenario() ?? base!;
    return { ...cloneScenario(cur), bookmarks: base?.bookmarks ?? [] };
  });
  const [errors, setErrors] = useState<string[]>([]);
  const [addKind, setAddKind] = useState('earthquake');
  const close = () => store.set({ showEditor: false });
  const env = (k: keyof EnvBase, v: number) => setS({ ...s, env: { ...s.env, [k]: v } });
  const setCmd = (i: number, c: Command) => setS({ ...s, commands: s.commands.map((x, k) => (k === i ? c : x)) });
  const validated = (): Scenario | null => {
    const { scenario, errors: errs } = validateScenario(s);
    setErrors(errs);
    return scenario;
  };
  const apply = () => {
    const v = validated();
    if (!v) return;
    loadScenario({ ...v, bookmarks: s.bookmarks }, false);
    close();
  };
  const save = () => {
    const v = validated();
    if (!v) return;
    const saved = saveToLibrary({ ...v, bookmarks: s.bookmarks });
    setErrors([`Saved “${saved.name}” to the local library.`]);
  };
  const assetName = (id: number) => runtime.city?.assets[id]?.name ?? `#${id}`;
  return (
    <div className="modal-back" role="dialog" aria-modal="true" aria-labelledby="editor-title" onKeyDown={(e) => e.key === 'Escape' && close()}>
      <div className="modal">
        <div className="modal-head">
          <h2 id="editor-title">Scenario editor</h2>
          <button className="icon-btn" aria-label="Close editor" onClick={close}>
            <IconClose />
          </button>
        </div>
        <div className="modal-body">
          <div className="grid2">
            <div className="field">
              <label htmlFor="se-name">Name</label>
              <input id="se-name" type="text" value={s.name} onChange={(e) => setS({ ...s, name: e.target.value })} />
            </div>
            <div className="field">
              <label htmlFor="se-seed">City seed (changes the whole city)</label>
              <div style={{ display: 'flex', gap: 6 }}>
                <input id="se-seed" type="number" value={s.seed} onChange={(e) => setS({ ...s, seed: Number(e.target.value) })} />
                <button className="btn small" onClick={() => setS({ ...s, seed: Math.floor(Math.random() * 1e9) })}>
                  Random
                </button>
              </div>
            </div>
          </div>
          <div className="field" style={{ marginTop: 10 }}>
            <label htmlFor="se-desc">Description</label>
            <textarea id="se-desc" value={s.description} onChange={(e) => setS({ ...s, description: e.target.value })} />
          </div>
          <div className="grid3" style={{ marginTop: 10 }}>
            <Num label="Agents (×100 residents)" value={s.agents} min={100} max={MAX_AGENTS} step={100} onChange={(v) => setS({ ...s, agents: v })} />
            <Num label="Start time (hour)" value={s.startHour} min={0} max={23.99} step={0.25} onChange={(v) => setS({ ...s, startHour: v })} />
            <Num label="Duration (min)" value={s.durationMin} min={5} max={360} step={5} onChange={(v) => setS({ ...s, durationMin: v })} />
          </div>
          <h3 style={{ fontSize: 13, margin: '18px 0 8px' }}>Base conditions</h3>
          <div className="grid3">
            {(Object.keys(ENV_RANGES) as (keyof EnvBase)[]).map((k) => (
              <Num key={k} label={ENV_LABELS[k]} value={s.env[k]} min={ENV_RANGES[k][0]} max={ENV_RANGES[k][1]} step={k === 'soilSaturation' ? 0.05 : 0.5} onChange={(v) => env(k, v)} />
            ))}
          </div>
          <h3 style={{ fontSize: 13, margin: '18px 0 8px' }}>Resilience</h3>
          <div className="grid3">
            <Num label="Seawall raise (m)" value={s.resilience.leveeRaise} min={-2} max={4} step={0.1} onChange={(v) => setS({ ...s, resilience: { ...s.resilience, leveeRaise: v } })} />
            <Num label="Backup fuel ×" value={s.resilience.backupHoursScale} min={0} max={20} step={0.5} onChange={(v) => setS({ ...s, resilience: { ...s.resilience, backupHoursScale: v } })} />
            <Num label="Pump capacity ×" value={s.resilience.pumpCapacityScale} min={0} max={5} step={0.1} onChange={(v) => setS({ ...s, resilience: { ...s.resilience, pumpCapacityScale: v } })} />
            <Num label="Crews per station" value={s.resilience.crewsPerStation} min={0} max={4} step={1} onChange={(v) => setS({ ...s, resilience: { ...s.resilience, crewsPerStation: v } })} />
            <Check label="Anchored / retrofitted substations" checked={s.resilience.substationRetrofit} onChange={(v) => setS({ ...s, resilience: { ...s.resilience, substationRetrofit: v } })} />
            <Check label="Retrofitted masonry & pre-code RC" checked={s.resilience.buildingRetrofit} onChange={(v) => setS({ ...s, resilience: { ...s.resilience, buildingRetrofit: v } })} />
            <Check label="Automatic evacuation orders" checked={s.resilience.autoEvacuation} onChange={(v) => setS({ ...s, resilience: { ...s.resilience, autoEvacuation: v } })} />
            <Check label="Aftershocks" checked={s.resilience.aftershocks} onChange={(v) => setS({ ...s, resilience: { ...s.resilience, aftershocks: v } })} />
          </div>
          <h3 style={{ fontSize: 13, margin: '18px 0 8px' }}>Economic model (illustrative)</h3>
          <div className="grid2">
            <Num label="Replacement cost ×" value={s.economics.costScale} min={0} max={10} step={0.1} onChange={(v) => setS({ ...s, economics: { ...s.economics, costScale: v } })} />
            <Num label="Contents / structure value" value={s.economics.contentsRatio} min={0} max={2} step={0.05} onChange={(v) => setS({ ...s, economics: { ...s.economics, contentsRatio: v } })} />
            <Num label="Business interruption / h (fraction)" value={s.economics.businessInterruptionPerHour} min={0} max={0.05} step={0.0001} onChange={(v) => setS({ ...s, economics: { ...s.economics, businessInterruptionPerHour: v } })} />
            <Num label="Infrastructure repair ×" value={s.economics.infraCostScale} min={0} max={10} step={0.1} onChange={(v) => setS({ ...s, economics: { ...s.economics, infraCostScale: v } })} />
          </div>
          <h3 style={{ fontSize: 13, margin: '18px 0 8px' }}>Scheduled events</h3>
          <table className="data cmd-table">
            <thead>
              <tr>
                <th>At (min)</th>
                <th>Event</th>
                <th>Parameters</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {s.commands.map((c, i) => (
                <tr key={c.id + ':' + i}>
                  <td>
                    <input type="number" aria-label="Minute" min={0} step={0.5} value={+((c.tick * STEP_SECONDS) / 60).toFixed(2)} onChange={(e) => setCmd(i, { ...c, tick: Math.max(0, Math.round((Number(e.target.value) * 60) / STEP_SECONDS)) })} />
                  </td>
                  <td style={{ textAlign: 'left' }}>{describeCommand(c.spec, assetName)}</td>
                  <td style={{ textAlign: 'left' }}>
                    <SpecFields spec={c.spec} onChange={(spec) => setCmd(i, { ...c, spec })} />
                  </td>
                  <td>
                    <button className="icon-btn" style={{ width: 26, height: 26 }} aria-label="Remove event" onClick={() => setS({ ...s, commands: s.commands.filter((_, k) => k !== i) })}>
                      <IconTrash size={13} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="btn-row" style={{ marginTop: 8 }}>
            <select className="compact" value={addKind} onChange={(e) => setAddKind(e.target.value)} aria-label="Event type to add">
              {Object.keys(NEW_SPECS).map((k) => (
                <option key={k} value={k}>
                  {k.replace('_', ' ')}
                </option>
              ))}
            </select>
            <button className="btn small" onClick={() => setS({ ...s, commands: [...s.commands, { id: Date.now() % 1e6, tick: 0, source: 'scenario', spec: JSON.parse(JSON.stringify(NEW_SPECS[addKind])) }] })}>
              <IconPlus size={13} /> Add event
            </button>
          </div>
          {errors.length > 0 && (
            <div className="note" style={{ marginTop: 12 }} role="status">
              {errors.slice(0, 6).map((e) => (
                <div key={e}>{e}</div>
              ))}
            </div>
          )}
        </div>
        <div className="modal-foot">
          <button className="btn" onClick={close}>
            Cancel
          </button>
          <button className="btn" onClick={save} data-testid="editor-save">
            Save to library
          </button>
          <button className="btn primary" onClick={apply} data-testid="editor-apply">
            Apply &amp; restart
          </button>
        </div>
      </div>
    </div>
  );
}

function SpecFields({ spec, onChange }: { spec: CommandSpec; onChange: (s: CommandSpec) => void }) {
  const entries = Object.entries(spec).filter(([k]) => k !== 'kind' && k !== 'env');
  const update = (k: string, v: unknown) => {
    const next = validateCommandSpec({ ...spec, [k]: v }, [], 'edit');
    if (next) onChange(next);
  };
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {entries.map(([k, v]) =>
        typeof v === 'boolean' ? (
          <label key={k} className="check" style={{ fontSize: 11 }}>
            <input type="checkbox" checked={v} onChange={(e) => update(k, e.target.checked)} />
            {k}
          </label>
        ) : typeof v === 'number' ? (
          <label key={k} style={{ fontSize: 11, display: 'flex', flexDirection: 'column', color: 'var(--muted)' }}>
            {k}
            <input type="number" value={v} step="any" onChange={(e) => update(k, Number(e.target.value))} />
          </label>
        ) : (
          <label key={k} style={{ fontSize: 11, display: 'flex', flexDirection: 'column', color: 'var(--muted)' }}>
            {k}
            <select className="compact" value={String(v)} onChange={(e) => update(k, e.target.value)}>
              {(spec.kind === 'line' ? ['damage', 'restore'] : ['damage', 'trip', 'restore']).map((o) => (
                <option key={o}>{o}</option>
              ))}
            </select>
          </label>
        ),
      )}
      {spec.kind === 'env' && <span className="muted">{Object.entries(spec.env).map(([k, v]) => `${k}=${v}`).join(', ')}</span>}
    </div>
  );
}

function Num({ label, value, min, max, step, onChange }: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void }) {
  const id = `n-${label.replace(/\W+/g, '')}`;
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input id={id} type="number" value={value} min={min} max={max} step={step} onChange={(e) => onChange(Number(e.target.value))} />
    </div>
  );
}

function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="check">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}
