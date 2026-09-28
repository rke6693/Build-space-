import { useMemo, useState } from 'react';
import { ECONOMIC_DISCLAIMER } from '../sim/export';
import type { Metrics } from '../sim/types';
import { LineChart, type Series } from './Chart';
import { DAMAGE_COLORS, DAMAGE_NAMES, fmtInt, fmtMoney, fmtPct, fmtTick, STATUS } from './format';
import { runtime } from './runtime';
import { useUI } from './store';

// validated dark categorical order (blue, orange, aqua, yellow)
const C = ['#3987e5', '#d95926', '#199e70', '#c98500'];

export function Analytics() {
  const m = useUI((s) => s.metrics);
  const hv = useUI((s) => s.historyVersion);
  const status = useUI((s) => s.status);
  const [table, setTable] = useState(false);
  const hist = useMemo(() => {
    void hv;
    const h = runtime.client.history;
    // include the live sample so charts reach "now"
    const cur = runtime.client.frame?.metrics;
    const list = h.filter((x) => !status || x.tick <= status.frontier);
    if (cur && (!list.length || list[list.length - 1].tick < cur.tick) && !status?.replay) list.push(cur);
    return list;
  }, [hv, status]);
  if (!m) return <p className="hint">Waiting for the simulation…</p>;
  const ticks = hist.map((h) => h.tick);
  const col = (k: keyof Metrics) => hist.map((h) => Number(h[k]));
  const playhead = status?.tick;
  const xMax = status?.frontier;
  const totalB = m.bNone + m.bSlight + m.bModerate + m.bExtensive + m.bCollapsed;
  const dmg = [m.bNone, m.bSlight, m.bModerate, m.bExtensive, m.bCollapsed];

  const popSeries: Series[] = [
    { key: 'affected', label: 'Affected', color: C[0], values: col('affected') },
    { key: 'evacuating', label: 'Evacuating', color: C[1], values: col('evacuating') },
    { key: 'sheltered', label: 'Sheltered', color: C[2], values: col('sheltered') },
    { key: 'injured', label: 'Injured', color: C[3], values: col('injured') },
  ];
  const lifeSeries: Series[] = [
    { key: 'grid', label: 'Grid', color: C[0], values: col('gridAvailability') },
    { key: 'roads', label: 'Roads', color: C[1], values: col('roadAccessibility') },
    { key: 'hosp', label: 'Hospital', color: C[2], values: col('hospitalAccess') },
    { key: 'comm', label: 'Telecom', color: C[3], values: col('commAvailability') },
  ];

  return (
    <div data-testid="analytics">
      <div className="section">
        <div className="section-title">
          Population <span className="muted" style={{ textTransform: 'none', letterSpacing: 0 }}>1 agent = 100 residents</span>
        </div>
        <div className="kpis">
          <Kpi label="Affected by hazards" value={fmtInt(m.affected)} sub={`of ${fmtInt(m.population)}`} hint="Residents exposed to damaging intensity at any point: shaking above ~0.3 g (MMI VIII), water deeper than 10 cm, fire or dense smoke, or a home/workplace with moderate or worse damage" />
          <Kpi label="Evacuating" value={fmtInt(m.evacuating)} sub={m.stranded > 0 ? `${fmtInt(m.stranded)} with no open shelter reachable` : 'en route to shelters'} />
          <Kpi label="Sheltered" value={fmtInt(m.sheltered)} sub={m.shelterInPlace > 0 ? `${fmtInt(m.evacuated)} in shelters · ${fmtInt(m.shelterInPlace)} in place` : 'in public shelters'} hint="Evacuees who reached a public shelter, plus those who took refuge in a nearby intact building (upper floors if flooded) because no open shelter could be reached" />
          <Kpi label="Injured (simulated)" value={fmtInt(m.injured)} sub={`${fmtInt(m.hospitalized)} hospitalised · ${fmtInt(m.trapped)} trapped`} testid="kpi-injured" />
        </div>
      </div>
      <div className="section">
        <div className="section-title">Buildings by damage state</div>
        <div className="kpi">
          <div className="bar-stack" role="img" aria-label={DAMAGE_NAMES.map((n, i) => `${n} ${dmg[i]}`).join(', ')}>
            {dmg.map((v, i) => (v > 0 ? <div key={i} style={{ flex: v, background: DAMAGE_COLORS[i] }} title={`${DAMAGE_NAMES[i]}: ${fmtInt(v)}`} /> : null))}
          </div>
          <div className="legend">
            {DAMAGE_NAMES.map((n, i) => (
              <span key={n}>
                <i style={{ background: DAMAGE_COLORS[i] }} />
                {n} <b className="num">{fmtInt(dmg[i])}</b>
              </span>
            ))}
          </div>
          <div className="s" style={{ marginTop: 4 }}>
            {fmtInt(totalB - m.bNone)} of {fmtInt(totalB)} damaged · {fmtInt(m.bBurning)} burning · {fmtInt(m.bFlooded)} flooded
          </div>
        </div>
      </div>
      <div className="section">
        <div className="section-title">Lifelines</div>
        <div className="kpis">
          <Kpi label="Grid availability" value={fmtPct(m.gridAvailability)} sub={`${m.substationsOnline}/${m.substationsTotal} substations`} status={m.gridAvailability} />
          <Kpi label="Road access" value={fmtPct(m.roadAccessibility)} sub={`${m.roadsClosed} closed · ${m.bridgesOpen}/${m.bridgesTotal} bridges`} status={m.roadAccessibility} />
          <Kpi label="Hospital access" value={fmtPct(m.hospitalAccess)} sub={`${m.hospitalsAccessible}/${m.hospitalsTotal} reachable & open`} status={m.hospitalAccess} />
          <Kpi label="Telecom · water" value={`${fmtPct(m.commAvailability)} · ${fmtPct(m.waterAvailability)}`} sub={`${m.pumpsOnline}/${m.pumpsTotal} flood pumps running`} status={Math.min(m.commAvailability, m.waterAvailability)} />
        </div>
      </div>
      <div className="section">
        <div className="section-title">Hazards</div>
        <div className="kpis">
          <Kpi label="Flooded area" value={`${m.floodedAreaKm2.toFixed(2)} km²`} sub={`max depth ${m.maxFloodDepth.toFixed(2)} m`} />
          <Kpi label="Active fire" value={`${((m.activeFires * 1024) / 1e4).toFixed(1)} ha`} sub={`${m.fireIncidents} incidents · ${m.burnedAreaKm2.toFixed(2)} km² burnt`} />
        </div>
      </div>
      <div className="section">
        <div className="section-title">
          Economic loss <span className="muted" style={{ textTransform: 'none', letterSpacing: 0 }}>illustrative model</span>
        </div>
        <div className="kpi" title={ECONOMIC_DISCLAIMER}>
          <div className="v">{fmtMoney(m.lossTotal)}</div>
          <div className="s">
            Structures {fmtMoney(m.lossBuildings)} · contents {fmtMoney(m.lossContents)} · infrastructure {fmtMoney(m.lossInfrastructure)} · business interruption {fmtMoney(m.lossBusiness)}
          </div>
          <div className="hint" style={{ marginTop: 4 }}>
            Configurable, illustrative estimate — not an actuarial figure. Adjust unit costs in the scenario editor.
          </div>
        </div>
      </div>
      <div className="section">
        <div className="section-title">
          Over time
          <button className="filter" aria-pressed={table} onClick={() => setTable(!table)}>
            {table ? 'Charts' : 'Table view'}
          </button>
        </div>
        {table ? (
          <MetricsTable hist={hist} />
        ) : hist.length < 2 ? (
          <p className="hint">Charts appear once the simulation has recorded a few samples (every 30 simulated seconds).</p>
        ) : (
          <>
            <div className="chart-card">
              <h4>Population status</h4>
              <LineChart ticks={ticks} series={popSeries} format={(v) => (v >= 1000 ? `${Math.round(v / 1000)}k` : fmtInt(v))} playhead={playhead} xMax={xMax} ariaLabel="Population affected, evacuating, sheltered and injured over time" />
            </div>
            <div className="chart-card">
              <h4>
                Lifeline availability <small>% of normal</small>
              </h4>
              <LineChart ticks={ticks} series={lifeSeries} format={(v) => fmtPct(v)} yMax={1} playhead={playhead} xMax={xMax} ariaLabel="Grid, road, hospital and telecom availability over time" />
            </div>
            <div className="chart-card">
              <h4>
                Flooded area <small>km²</small>
              </h4>
              <LineChart ticks={ticks} series={[{ key: 'flood', label: 'Flooded area', color: C[0], values: col('floodedAreaKm2') }]} height={90} format={(v) => v.toFixed(2)} playhead={playhead} xMax={xMax} ariaLabel="Flooded area over time" />
            </div>
            <div className="chart-card">
              <h4>
                Active fire <small>ha</small>
              </h4>
              <LineChart ticks={ticks} series={[{ key: 'fire', label: 'Active fire', color: C[1], values: hist.map((h) => (h.activeFires * 1024) / 1e4) }]} height={90} format={(v) => v.toFixed(1)} playhead={playhead} xMax={xMax} ariaLabel="Active fire area over time" />
            </div>
            <div className="chart-card">
              <h4>
                Economic loss <small>illustrative, $</small>
              </h4>
              <LineChart ticks={ticks} series={[{ key: 'loss', label: 'Total loss', color: C[2], values: col('lossTotal') }]} height={90} format={fmtMoney} playhead={playhead} xMax={xMax} ariaLabel="Estimated economic loss over time" />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Kpi({ label, value, sub, status, testid, hint }: { label: string; value: string; sub?: string; status?: number; testid?: string; hint?: string }) {
  const s = status === undefined ? null : status > 0.95 ? { c: STATUS.ok, t: 'normal' } : status > 0.75 ? { c: STATUS.warn, t: 'degraded' } : status > 0.4 ? { c: STATUS.serious, t: 'impaired' } : { c: STATUS.critical, t: 'critical' };
  return (
    <div className="kpi" data-testid={testid} title={hint}>
      <div className="k">
        {label}
        {s && (
          <span style={{ marginLeft: 'auto', color: s.c, fontSize: 10 }} title={`Status: ${s.t}`}>
            ● {s.t}
          </span>
        )}
      </div>
      <div className="v">{value}</div>
      {sub && <div className="s">{sub}</div>}
    </div>
  );
}

function MetricsTable({ hist }: { hist: Metrics[] }) {
  const rows = hist.slice(-40).reverse();
  return (
    <div style={{ maxHeight: 360, overflow: 'auto' }}>
      <table className="data">
        <thead>
          <tr>
            <th>Time</th>
            <th>Affected</th>
            <th>Injured</th>
            <th>Grid</th>
            <th>Roads</th>
            <th>Flood km²</th>
            <th>Fire ha</th>
            <th>Loss</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((h) => (
            <tr key={h.tick}>
              <td className="mono">{fmtTick(h.tick).slice(2)}</td>
              <td>{fmtInt(h.affected)}</td>
              <td>{fmtInt(h.injured)}</td>
              <td>{fmtPct(h.gridAvailability)}</td>
              <td>{fmtPct(h.roadAccessibility)}</td>
              <td>{h.floodedAreaKm2.toFixed(2)}</td>
              <td>{((h.activeFires * 1024) / 1e4).toFixed(1)}</td>
              <td>{fmtMoney(h.lossTotal)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
