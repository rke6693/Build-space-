import { useEffect, useMemo, useRef, useState } from 'react';
import { GRID, N_CELLS, STEP_SECONDS } from '../sim/config';
import { builtinScenarios, cloneScenario, minutesToTicks } from '../sim/scenario';
import { type Metrics, type Scenario, Zone } from '../sim/types';
import type { HeadlessResult } from '../worker/protocol';
import { cancelComparison, currentScenario, loadLibrary, loadScenario, runComparison } from './actions';
import { LineChart } from './Chart';
import { fmtInt, fmtMoney, fmtPct, fmtTick } from './format';
import { runtime } from './runtime';
import { useUI } from './store';

interface Variant {
  id: string;
  label: string;
  make: (a: Scenario) => Scenario;
}

const VARIANTS: Variant[] = [
  { id: 'mitigated', label: 'Mitigated city: retrofits, 6 h pump fuel, seawall +1 m', make: (a) => ({ ...a, resilience: { ...a.resilience, substationRetrofit: true, buildingRetrofit: true, backupHoursScale: 4, leveeRaise: a.resilience.leveeRaise + 1 } }) },
  { id: 'weaker', label: 'First earthquake 0.5 magnitude weaker', make: (a) => ({ ...a, commands: a.commands.map((c, i) => (c.spec.kind === 'earthquake' && a.commands.findIndex((x) => x.spec.kind === 'earthquake') === i ? { ...c, spec: { ...c.spec, magnitude: c.spec.magnitude - 0.5 } } : c)) }) },
  { id: 'no-aftershocks', label: 'No aftershocks', make: (a) => ({ ...a, resilience: { ...a.resilience, aftershocks: false } }) },
  { id: 'crews', label: 'Double fire crews', make: (a) => ({ ...a, resilience: { ...a.resilience, crewsPerStation: Math.min(4, a.resilience.crewsPerStation * 2) } }) },
  { id: 'no-evac', label: 'No automatic evacuation orders', make: (a) => ({ ...a, resilience: { ...a.resilience, autoEvacuation: false } }) },
  { id: 'baseline', label: 'Nothing happens (no events)', make: (a) => ({ ...a, commands: [] }) },
];

export function Compare() {
  const cmp = useUI((s) => s.compare);
  const status = useUI((s) => s.status);
  const [choice, setChoice] = useState('v:mitigated');
  const [horizon, setHorizon] = useState<'now' | 'full'>('now');
  const lib = useMemo(() => loadLibrary(), []);
  const builtins = useMemo(() => builtinScenarios(), []);

  const run = () => {
    const a = currentScenario();
    if (!a) return;
    let b: Scenario;
    let label: string;
    if (choice.startsWith('v:')) {
      const v = VARIANTS.find((x) => `v:${x.id}` === choice)!;
      b = v.make(cloneScenario(a));
      label = `B — ${v.label}`;
    } else {
      const src = choice.startsWith('b:') ? builtins.find((x) => `b:${x.id}` === choice) : lib.find((x) => `s:${x.id}` === choice);
      if (!src) return;
      b = cloneScenario(src);
      label = `B — ${src.name}`;
    }
    const ticks = horizon === 'now' ? Math.max(minutesToTicks(10), status?.frontier ?? 0) : minutesToTicks(Math.max(a.durationMin, b.durationMin));
    runComparison(b, label, ticks);
  };

  return (
    <div data-testid="compare">
      <div className="section">
        <div className="section-title">Compare scenarios</div>
        <p className="hint" style={{ marginTop: 0 }}>
          Scenario A is your current session (every event issued so far). B re-runs from T+0 with the <b>same seed, population, start time and base conditions</b>; only its events and resilience settings differ. Both run deterministically in background workers.
        </p>
        <div className="form" style={{ marginTop: 6 }}>
          <div className="field">
            <label htmlFor="cmp-b">Scenario B</label>
            <select id="cmp-b" className="input" value={choice} onChange={(e) => setChoice(e.target.value)} data-testid="compare-choice">
              <optgroup label="What-if variants of A">
                {VARIANTS.map((v) => (
                  <option key={v.id} value={`v:${v.id}`}>
                    {v.label}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Built-in scenarios">
                {builtins.map((b) => (
                  <option key={b.id} value={`b:${b.id}`}>
                    {b.name}
                  </option>
                ))}
              </optgroup>
              {lib.length > 0 && (
                <optgroup label="Saved scenarios">
                  {lib.map((b) => (
                    <option key={b.id} value={`s:${b.id}`}>
                      {b.name}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
          </div>
          <div className="seg" role="group" aria-label="Comparison horizon">
            <button aria-pressed={horizon === 'now'} onClick={() => setHorizon('now')}>
              Up to now ({fmtTick(Math.max(minutesToTicks(10), status?.frontier ?? 0)).slice(2)})
            </button>
            <button aria-pressed={horizon === 'full'} onClick={() => setHorizon('full')}>
              Full duration
            </button>
          </div>
          {cmp.running ? (
            <>
              <Progress label="A" value={cmp.progressA} />
              <Progress label="B" value={cmp.progressB} />
              <button className="btn small" onClick={cancelComparison}>
                Cancel
              </button>
            </>
          ) : (
            <button className="btn primary block" onClick={run} data-testid="run-compare">
              Run comparison
            </button>
          )}
          {cmp.error && <div className="warn-note">{cmp.error}</div>}
        </div>
      </div>
      {cmp.a && cmp.b && <Results a={cmp.a} b={cmp.b} labelA={cmp.labelA} labelB={cmp.labelB} scenarioB={cmp.scenarioB} />}
    </div>
  );
}

function Progress({ label, value }: { label: string; value: number }) {
  return (
    <div className="field">
      <div className="field-row">
        <span className="lbl">Running {label}</span>
        <span className="val">{Math.round(value * 100)}%</span>
      </div>
      <div className="progress">
        <div style={{ width: `${value * 100}%` }} />
      </div>
    </div>
  );
}

interface Row {
  label: string;
  a: number;
  b: number;
  fmt: (v: number) => string;
  higherBetter?: boolean;
}

const peak = (s: Metrics[], k: keyof Metrics) => s.reduce((m, x) => Math.max(m, Number(x[k])), 0);
const low = (s: Metrics[], k: keyof Metrics) => s.reduce((m, x) => Math.min(m, Number(x[k])), 1);

function Results({ a, b, labelA, labelB, scenarioB }: { a: HeadlessResult; b: HeadlessResult; labelA: string; labelB: string; scenarioB: Scenario | null }) {
  const rows: Row[] = [
    { label: 'Injured (simulated, peak)', a: peak(a.samples, 'injured'), b: peak(b.samples, 'injured'), fmt: fmtInt },
    { label: 'Residents affected', a: a.final.affected, b: b.final.affected, fmt: fmtInt },
    { label: 'Buildings collapsed', a: a.final.bCollapsed, b: b.final.bCollapsed, fmt: fmtInt },
    { label: 'Extensive + collapse', a: a.final.bExtensive + a.final.bCollapsed, b: b.final.bExtensive + b.final.bCollapsed, fmt: fmtInt },
    { label: 'Lowest grid availability', a: low(a.samples, 'gridAvailability'), b: low(b.samples, 'gridAvailability'), fmt: (v) => fmtPct(v), higherBetter: true },
    { label: 'Lowest road accessibility', a: low(a.samples, 'roadAccessibility'), b: low(b.samples, 'roadAccessibility'), fmt: (v) => fmtPct(v), higherBetter: true },
    { label: 'Lowest hospital access', a: low(a.samples, 'hospitalAccess'), b: low(b.samples, 'hospitalAccess'), fmt: (v) => fmtPct(v), higherBetter: true },
    { label: 'Peak flooded area', a: peak(a.samples, 'floodedAreaKm2'), b: peak(b.samples, 'floodedAreaKm2'), fmt: (v) => `${v.toFixed(2)} km²` },
    { label: 'Burnt area', a: a.final.burnedAreaKm2, b: b.final.burnedAreaKm2, fmt: (v) => `${(v * 100).toFixed(1)} ha` },
    { label: 'Economic loss (illustrative)', a: a.final.lossTotal, b: b.final.lossTotal, fmt: fmtMoney },
  ];
  const ticks = a.samples.map((s) => s.tick);
  const pick = (r: HeadlessResult, k: keyof Metrics) => ticks.map((_, i) => Number(r.samples[i]?.[k] ?? NaN));
  const onlyIn = (x: HeadlessResult, y: HeadlessResult) => {
    const keys = new Set(y.events.map((e) => `${e.type}|${e.title}`));
    return x.events.filter((e) => e.severity >= 3 && !keys.has(`${e.type}|${e.title}`)).slice(0, 5);
  };
  return (
    <div className="section" data-testid="compare-results">
      <div className="section-title">Outcome at {fmtTick(a.final.tick)}</div>
      <table className="data cmp-table">
        <thead>
          <tr>
            <th>Metric</th>
            <th>A</th>
            <th>B</th>
            <th>B vs A</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            // a difference smaller than the displayed precision is not a difference
            const d = r.fmt(r.a) === r.fmt(r.b) ? 0 : r.b - r.a;
            const better = r.higherBetter ? d > 1e-9 : d < -1e-9;
            const worse = r.higherBetter ? d < -1e-9 : d > 1e-9;
            return (
              <tr key={r.label}>
                <td>{r.label}</td>
                <td>{r.fmt(r.a)}</td>
                <td>{r.fmt(r.b)}</td>
                <td className={better ? 'good' : worse ? 'bad' : ''} style={{ whiteSpace: 'nowrap' }} title={Math.abs(d) < 1e-9 ? 'No difference' : `B is ${d > 0 ? 'higher' : 'lower'} than A (${better ? 'better' : 'worse'})`}>
                  {Math.abs(d) < 1e-9 ? '=' : `${d > 0 ? '▲' : '▼'} ${better ? 'better' : 'worse'}`}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="hint">
        {labelA} · {labelB}. Checksums A {a.checksum.toString(16)} / B {b.checksum.toString(16)}.
      </p>
      <div className="chart-card">
        <h4>Injured (simulated)</h4>
        <LineChart ticks={ticks} series={[{ key: 'a', label: 'A', color: '#3987e5', values: pick(a, 'injured') }, { key: 'b', label: 'B', color: '#d95926', values: pick(b, 'injured'), dashed: true }]} format={(v) => (v >= 1000 ? `${Math.round(v / 1000)}k` : fmtInt(v))} ariaLabel="Injured over time, A versus B" height={100} />
      </div>
      <div className="chart-card">
        <h4>Grid availability</h4>
        <LineChart ticks={ticks} series={[{ key: 'a', label: 'A', color: '#3987e5', values: pick(a, 'gridAvailability') }, { key: 'b', label: 'B', color: '#d95926', values: pick(b, 'gridAvailability'), dashed: true }]} format={(v) => fmtPct(v)} yMax={1} ariaLabel="Grid availability, A versus B" height={100} />
      </div>
      <div className="chart-card">
        <h4>Flooded area (km²)</h4>
        <LineChart ticks={ticks} series={[{ key: 'a', label: 'A', color: '#3987e5', values: pick(a, 'floodedAreaKm2') }, { key: 'b', label: 'B', color: '#d95926', values: pick(b, 'floodedAreaKm2'), dashed: true }]} format={(v) => v.toFixed(2)} ariaLabel="Flooded area, A versus B" height={100} />
      </div>
      <div className="section-title" style={{ marginTop: 10 }}>
        Final state maps
      </div>
      <div className="minimaps">
        <MiniMap r={a} title="A" />
        <MiniMap r={b} title="B" />
      </div>
      <div className="legend" style={{ marginTop: 6 }}>
        <span>
          <i style={{ background: '#3987e5' }} />
          flooded ≥ 30 cm
        </span>
        <span>
          <i style={{ background: '#d95926' }} />
          burnt
        </span>
        <span>
          <i style={{ background: '#d55181' }} />
          extensive damage / collapse
        </span>
        <span>
          <i style={{ background: '#4b3a56' }} />
          no grid power
        </span>
      </div>
      <DiffEvents title="Critical events only in A" list={onlyIn(a, b)} />
      <DiffEvents title="Critical events only in B" list={onlyIn(b, a)} />
      {scenarioB && (
        <button className="btn small" style={{ marginTop: 8 }} onClick={() => loadScenario(scenarioB)}>
          Load B into the viewport
        </button>
      )}
    </div>
  );
}

function DiffEvents({ title, list }: { title: string; list: HeadlessResult['events'] }) {
  if (!list.length) return null;
  return (
    <div style={{ marginTop: 8 }}>
      <div className="section-title">{title}</div>
      <ul className="sched">
        {list.map((e) => (
          <li key={e.id}>
            <span className="t">{fmtTick(e.tick).slice(2)}</span>
            <span>{e.title}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function MiniMap({ r, title }: { r: HeadlessResult; title: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const city = runtime.city;
    const cv = ref.current;
    if (!city || !cv) return;
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    const img = ctx.createImageData(GRID, GRID);
    const dmg = new Uint8Array(N_CELLS);
    const dark = new Uint8Array(N_CELLS);
    const b = city.buildings;
    for (let k = 0; k < b.count; k++) {
      if (r.bDS[k] >= 3) dmg[b.cell[k]] = 1;
      if (!r.bPowered[k]) dark[b.cell[k]] = 1;
    }
    for (let c = 0; c < N_CELLS; c++) {
      const z = city.zone[c];
      let col = z === Zone.Ocean || z === Zone.River ? [13, 27, 42] : city.road[c] ? [44, 50, 58] : [27, 33, 41];
      if (dark[c]) col = [75, 58, 86];
      if (r.maxWater[c] / 20 >= 0.3 && z !== Zone.Ocean && z !== Zone.River) col = [57, 135, 229];
      if (r.burned[c]) col = [217, 89, 38];
      if (dmg[c]) col = [213, 81, 129];
      img.data.set([col[0], col[1], col[2], 255], c * 4);
    }
    ctx.putImageData(img, 0, 0);
  }, [r]);
  return (
    <div className="minimap">
      <canvas ref={ref} width={GRID} height={GRID} aria-label={`Final state map for scenario ${title}`} role="img" />
      <div>
        {title} · {fmtInt(r.final.bCollapsed)} collapsed · {(r.final.t / 60).toFixed(0)} min ({((r.final.tick * STEP_SECONDS) / 3600).toFixed(1)} h)
      </div>
    </div>
  );
}
