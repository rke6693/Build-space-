import { useMemo, useState } from 'react';
import { cascadeDepth, causalChain } from '../sim/events';
import type { Asset } from '../sim/types';
import { selectEvent, selectObject } from './actions';
import { CausalChain } from './Events';
import { CATEGORY, SEVERITY, fmtTick, statusColor } from './format';
import { runtime } from './runtime';
import { useUI } from './store';

interface GNode {
  key: string;
  label: string;
  x: number;
  y: number;
  asset?: Asset;
  members?: Asset[];
}

/** Dependency graph of the lifeline network plus causal explanations of cascades. */
export function Causality() {
  const evv = useUI((s) => s.eventsVersion);
  void useUI((s) => s.status);
  const selected = useUI((s) => s.selectedEvent);
  const city = runtime.city;
  const f = runtime.client.frame;
  const [hover, setHover] = useState<string | null>(null);

  const graph = useMemo(() => {
    if (!city) return null;
    const by = (k: Asset['kind']) => city.assets.filter((a) => a.kind === k);
    const cols: GNode[][] = [[], [], [], []];
    const short = (s: string) => s.replace(' Substation', '').replace(' 230 kV', '').replace('Eastport Pump Station', 'Pump').replace('Power Station', 'Plant').replace('Northern 345 kV Interconnect', 'Interconnect').replace(' General Hospital', ' Gen.').replace(' Medical Center', ' Med.').replace(' Hospital', ' Hosp.').replace('Riverside Water Works', 'Water Works').replace('Meridian Data Exchange', 'Telecom Exch.').replace('City Hall & Emergency Operations Centre', 'EOC');
    [...by('plant'), ...by('import')].forEach((a) => cols[0].push({ key: `a${a.id}`, label: short(a.name), x: 0, y: 0, asset: a }));
    by('tx').forEach((a) => cols[1].push({ key: `a${a.id}`, label: short(a.name), x: 0, y: 0, asset: a }));
    by('sub').forEach((a) => cols[2].push({ key: `a${a.id}`, label: short(a.name), x: 0, y: 0, asset: a }));
    [...by('pump'), ...by('water'), ...by('hub'), ...by('hospital'), ...by('eoc')].forEach((a) => cols[3].push({ key: `a${a.id}`, label: short(a.name), x: 0, y: 0, asset: a }));
    cols[3].push({ key: 'towers', label: `Cell towers (${by('tower').length})`, x: 0, y: 0, members: by('tower') });
    cols[3].push({ key: 'fire', label: `Fire stations (${by('fire').length})`, x: 0, y: 0, members: by('fire') });
    cols[3].push({ key: 'shelters', label: `Shelters (${by('shelter').length})`, x: 0, y: 0, members: by('shelter') });
    const xs = [8, 88, 168, 262];
    const H = Math.max(...cols.map((c) => c.length)) * 25 + 16;
    cols.forEach((c, ci) => c.forEach((n, i) => ((n.x = xs[ci]), (n.y = 10 + ((i + 0.5) * (H - 20)) / c.length))));
    const nodes = cols.flat();
    const byKey = new Map(nodes.map((n) => [n.key, n]));
    const edges: { from: GNode; to: GNode; line?: number; kind: string }[] = [];
    for (const l of city.lines) {
      const a = byKey.get(`a${l.a}`);
      const b = byKey.get(`a${l.b}`);
      if (a && b) edges.push({ from: a, to: b, line: l.id, kind: 'power' });
    }
    for (const n of cols[3]) {
      const sub = n.asset?.substation ?? n.members?.[0]?.substation ?? -1;
      const s = byKey.get(`a${sub}`);
      if (s) edges.push({ from: s, to: n, kind: 'power' });
    }
    const hub = byKey.get(`a${by('hub')[0]?.id}`);
    const tw = byKey.get('towers');
    if (hub && tw) edges.push({ from: hub, to: tw, kind: 'comms' });
    const water = byKey.get(`a${by('water')[0]?.id}`);
    for (const h of by('hospital')) {
      const hn = byKey.get(`a${h.id}`);
      if (water && hn) edges.push({ from: water, to: hn, kind: 'water' });
    }
    return { nodes, edges, H };
  }, [city]);

  const cascades = useMemo(() => {
    void evv;
    const evs = runtime.client.events;
    const out: { id: number; depth: number }[] = [];
    for (let k = Math.max(0, evs.length - 500); k < evs.length; k++) {
      const e = evs[k];
      if (e.severity < 2 || !e.causes.length) continue;
      const d = cascadeDepth(evs, e.id);
      if (d >= 3) out.push({ id: e.id, depth: d });
    }
    return out.sort((a, b) => b.depth - a.depth || b.id - a.id).slice(0, 8);
  }, [evv]);

  if (!city || !graph) return null;
  const nodeStatus = (n: GNode): number => {
    if (!f) return 2;
    if (n.asset) return f.assets[n.asset.id]?.status ?? 2;
    const st = (n.members ?? []).map((m) => f.assets[m.id]?.status ?? 2);
    return st.every((s) => s === 2) ? 2 : st.some((s) => s === 2 || s === 1) ? 1 : 0;
  };
  const sel = selected !== null ? runtime.client.events[selected] : null;
  return (
    <div data-testid="causality">
      <div className="section">
        <div className="section-title">Lifeline dependency graph</div>
        <div className="depgraph">
          <svg viewBox={`0 0 360 ${graph.H}`} role="img" aria-label="Dependency graph from power generation through substations to critical services, coloured by live status">
            {graph.edges.map((e, i) => {
              const dead = (e.line !== undefined && f?.lines[e.line] === 1) || nodeStatus(e.from) === 0;
              const hot = hover && (hover === e.from.key || hover === e.to.key);
              const x1 = e.from.x + 70;
              const x2 = e.to.x;
              const mx = (x1 + x2) / 2;
              return <path key={i} className={`edge ${dead ? 'dead' : ''} ${hot ? 'hot' : ''}`} d={`M${x1},${e.from.y} C${mx},${e.from.y} ${mx},${e.to.y} ${x2},${e.to.y}`} stroke={e.kind === 'water' ? 'rgba(57,135,229,0.45)' : e.kind === 'comms' ? 'rgba(201,133,0,0.45)' : undefined} />;
            })}
            {graph.nodes.map((n) => {
              const s = nodeStatus(n);
              return (
                <g
                  key={n.key}
                  className="node"
                  transform={`translate(${n.x},${n.y - 9})`}
                  onMouseEnter={() => setHover(n.key)}
                  onMouseLeave={() => setHover(null)}
                  onClick={() => n.asset && selectObject({ kind: 'asset', id: n.asset.id })}
                  style={{ cursor: n.asset ? 'pointer' : 'default' }}
                  role="button"
                  aria-label={`${n.label}: ${s === 2 ? 'operational' : s === 1 ? 'degraded' : 'down'}`}
                >
                  <rect width={n.x > 200 ? 96 : 72} height={18} rx={5} fill="rgba(16,20,27,0.95)" />
                  <circle cx={8} cy={9} r={3.5} fill={statusColor(s)} />
                  <text x={15} y={12.5}>
                    {n.label.length > (n.x > 200 ? 17 : 12) ? n.label.slice(0, n.x > 200 ? 16 : 11) + '…' : n.label}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
        <div className="legend" style={{ marginTop: 6 }}>
          <span>
            <i style={{ background: statusColor(2) }} />
            operational
          </span>
          <span>
            <i style={{ background: statusColor(1) }} />
            degraded / backup
          </span>
          <span>
            <i style={{ background: statusColor(0) }} />
            down
          </span>
          <span>
            <i className="line" style={{ background: 'rgba(208,59,59,0.8)' }} />
            broken link
          </span>
        </div>
        <p className="hint">Generation → transmission → distribution → services. Water feeds hospitals; the telecom exchange backhauls every cell tower. Hover to trace links, click to inspect.</p>
      </div>
      {sel && sel.causes.length > 0 && (
        <div className="section">
          <div className="section-title">Causal chain · {sel.title}</div>
          <CausalChain chain={causalChain(runtime.client.events, sel.id, 16)} />
        </div>
      )}
      <div className="section">
        <div className="section-title">Major cascades</div>
        {!cascades.length && <p className="hint">No multi-step cascades yet. Try the showcase scenario or trigger an earthquake near the Eastport polder.</p>}
        <ul className="ev-list">
          {cascades.map(({ id, depth }) => {
            const e = runtime.client.events[id];
            return (
              <li key={id}>
                <button className={`ev ${selected === id ? 'sel' : ''}`} onClick={() => selectEvent(id)}>
                  <span className="t">{fmtTick(e.tick).slice(2)}</span>
                  <span>
                    <span className="title">
                      <i className="cat" style={{ background: CATEGORY[e.category]?.color }} aria-hidden="true" />
                      <span style={{ flex: 1 }}>{e.title}</span>
                      <span className={`sev s${e.severity}`}>{SEVERITY[e.severity]}</span>
                    </span>
                    <span className="sub">{depth}-step cascade · root: {rootTitle(id)}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

function rootTitle(id: number): string {
  const chain = causalChain(runtime.client.events, id, 60);
  const roots = chain.filter((l) => l.event.causes.length === 0);
  return roots.length ? roots[roots.length - 1].event.title : '—';
}
