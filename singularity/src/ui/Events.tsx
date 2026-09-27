import { useMemo, useState } from 'react';
import { cascadeDepth, causalChain, consequences } from '../sim/events';
import type { SimEvent } from '../sim/types';
import { exportResults, seek, selectEvent } from './actions';
import { CATEGORY, SEVERITY, fmtTick } from './format';
import { IconDownload } from './icons';
import { runtime } from './runtime';
import { store, useUI } from './store';

const GROUPS: { id: string; label: string; cats: string[] }[] = [
  { id: 'seismic', label: 'Seismic', cats: ['seismic'] },
  { id: 'flood', label: 'Flood', cats: ['flood', 'water'] },
  { id: 'fire', label: 'Fire', cats: ['fire'] },
  { id: 'infra', label: 'Power & telecom', cats: ['power', 'comms'] },
  { id: 'transport', label: 'Transport', cats: ['transport'] },
  { id: 'people', label: 'People', cats: ['health', 'population'] },
  { id: 'weather', label: 'Weather', cats: ['weather', 'user'] },
];

export function EventLog() {
  const ev = useUI((s) => s.eventsVersion);
  const status = useUI((s) => s.status);
  const selected = useUI((s) => s.selectedEvent);
  const [minSev, setMinSev] = useState(1);
  const [groups, setGroups] = useState<Set<string>>(new Set());
  const [q, setQ] = useState('');
  const list = useMemo(() => {
    void ev;
    const cats = new Set(GROUPS.filter((g) => groups.has(g.id)).flatMap((g) => g.cats));
    const needle = q.trim().toLowerCase();
    return runtime.client.events
      .filter((e) => e.severity >= minSev && (cats.size === 0 || cats.has(e.category)) && (!needle || e.title.toLowerCase().includes(needle) || e.detail.toLowerCase().includes(needle)))
      .slice(-300)
      .reverse();
  }, [ev, minSev, groups, q]);
  const now = status?.tick ?? 0;
  const sel = selected !== null ? runtime.client.events[selected] : null;
  return (
    <div data-testid="event-log">
      {sel && <EventDetail ev={sel} />}
      <div className="filters" role="group" aria-label="Severity filter">
        {['All', 'Minor+', 'Major+', 'Critical'].map((l, i) => (
          <button key={l} className="filter" aria-pressed={minSev === i} onClick={() => setMinSev(i)}>
            {l}
          </button>
        ))}
      </div>
      <div className="filters" role="group" aria-label="Category filter">
        {GROUPS.map((g) => (
          <button
            key={g.id}
            className="filter"
            aria-pressed={groups.has(g.id)}
            onClick={() => {
              const n = new Set(groups);
              if (n.has(g.id)) n.delete(g.id);
              else n.add(g.id);
              setGroups(n);
            }}
          >
            <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: CATEGORY[g.cats[0]].color, marginRight: 5 }} aria-hidden="true" />
            {g.label}
          </button>
        ))}
      </div>
      <input type="text" placeholder="Search events…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search events" style={{ marginBottom: 8 }} />
      {!list.length && <p className="hint">No events yet. Trigger a disaster from the toolbox — every consequence will be logged here with its causes.</p>}
      <ul className="ev-list">
        {list.map((e) => (
          <li key={e.id}>
            <EventRow e={e} future={e.tick > now} selected={e.id === selected} />
          </li>
        ))}
      </ul>
      <div className="btn-row" style={{ marginTop: 10 }}>
        <button className="btn small" onClick={() => exportResults('events')}>
          <IconDownload size={14} /> Events CSV
        </button>
        <button className="btn small" onClick={() => exportResults('json')}>
          <IconDownload size={14} /> Summary JSON
        </button>
      </div>
    </div>
  );
}

function EventRow({ e, future, selected }: { e: SimEvent; future: boolean; selected: boolean }) {
  return (
    <button className={`ev ${future ? 'future' : ''} ${selected ? 'sel' : ''}`} onClick={() => selectEvent(e.id)} title={future ? 'Recorded future (you are replaying an earlier moment)' : e.detail}>
      <span className="t">{fmtTick(e.tick).slice(2)}</span>
      <span style={{ minWidth: 0 }}>
        <span className="title">
          <i className="cat" style={{ background: CATEGORY[e.category]?.color }} aria-hidden="true" />
          <span style={{ flex: 1 }}>{e.title}</span>
          {e.severity >= 2 && <span className={`sev s${e.severity}`}>{SEVERITY[e.severity]}</span>}
        </span>
        <span className="sub">
          {CATEGORY[e.category]?.label}
          {e.causes.length ? ` · caused by ${e.causes.length} earlier event${e.causes.length > 1 ? 's' : ''}` : ''}
        </span>
      </span>
    </button>
  );
}

export function EventDetail({ ev }: { ev: SimEvent }) {
  const events = runtime.client.events;
  const chain = causalChain(events, ev.id, 16);
  const depth = cascadeDepth(events, ev.id);
  const cons = consequences(events, ev.id, 12);
  return (
    <div className="chart-card" style={{ marginBottom: 12 }} data-testid="event-detail">
      <h4>
        <span>
          <i className="cat" style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: CATEGORY[ev.category]?.color, marginRight: 6 }} aria-hidden="true" />
          {ev.title}
        </span>
        <button className="icon-btn" style={{ width: 24, height: 24 }} aria-label="Close event details" onClick={() => store.set({ selectedEvent: null })}>
          ×
        </button>
      </h4>
      <p className="hint" style={{ margin: '4px 0 8px' }}>
        {fmtTick(ev.tick)} · {SEVERITY[ev.severity]} · {CATEGORY[ev.category]?.label}
        {depth >= 2 ? ` · cascade depth ${depth}` : ''}
      </p>
      <p style={{ margin: '0 0 10px', fontSize: 12.5 }}>{ev.detail}</p>
      <div className="btn-row" style={{ marginBottom: 10 }}>
        <button className="btn small" onClick={() => seek(Math.max(0, ev.tick - 15))}>
          Replay from 30 s before
        </button>
        <button className="btn small" onClick={() => runtime.viewport?.focusEvent(ev)}>
          Show on map
        </button>
      </div>
      {chain.length > 1 && (
        <>
          <div className="section-title">Why did this happen?</div>
          <CausalChain chain={chain} />
        </>
      )}
      {cons.length > 0 && (
        <>
          <div className="section-title" style={{ marginTop: 8 }}>
            Downstream consequences ({cons.length}
            {cons.length >= 12 ? '+' : ''})
          </div>
          <ul className="ev-list">
            {cons.slice(0, 6).map((c) => (
              <li key={c.id}>
                <EventRow e={c} future={false} selected={false} />
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

export function CausalChain({ chain }: { chain: ReturnType<typeof causalChain> }) {
  return (
    <ol className="chain" data-testid="causal-chain">
      {chain.map((l, i) => (
        <li key={`${l.event.id}-${i}`} style={{ marginLeft: Math.min(4, l.depth) * 10 }}>
          <span className="node" style={{ background: CATEGORY[l.event.category]?.color }} aria-hidden="true" />
          <button onClick={() => selectEvent(l.event.id)}>
            <div className="lvl">
              {l.depth === 0 ? 'effect' : `cause · ${l.depth} step${l.depth > 1 ? 's' : ''} back`} · {fmtTick(l.event.tick)}
            </div>
            <div className="title">{l.event.title}</div>
            <div className="det">{l.event.detail}</div>
          </button>
        </li>
      ))}
    </ol>
  );
}
