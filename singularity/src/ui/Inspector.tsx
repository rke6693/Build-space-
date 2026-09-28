import type { ReactElement } from 'react';
import type { Selection } from '../render/Viewport';
import { FRAGILITY_BETA } from '../sim/city/generate';
import { GRID, N_CELLS, PEOPLE_PER_AGENT, cellX, cellZ } from '../sim/config';
import { fragility } from '../sim/math';
import { DS_NAMES, buildingMedians, liquefactionSettlement, mmiFromPga } from '../sim/systems/earthquake';
import { ASSET_KIND_NAMES, type Asset, BTYPE_NAMES, SCLASS_NAMES, type SimEvent, ZONE_NAMES } from '../sim/types';
import { focusSelection, selectEvent, selectObject } from './actions';
import { CATEGORY, DAMAGE_COLORS, fmtLocation, fmtMoney, fmtTick, statusColor, statusName } from './format';
import { IconBridge, IconBuilding, IconCamera, IconCell, IconPower, IconShield } from './icons';
import { runtime } from './runtime';
import { store, useUI } from './store';

export function Inspector() {
  const sel = useUI((s) => s.selection);
  void useUI((s) => s.status); // refresh with simulation status
  const city = runtime.city;
  const f = runtime.client.frame;
  if (!sel || !city) {
    return (
      <div className="section">
        <p className="hint">Click any building, facility, bridge, levee or patch of ground in the 3D view to inspect its live state. Facilities show their dependencies and why they failed.</p>
        <CityOverview />
      </div>
    );
  }
  return (
    <div>
      {sel.kind === 'building' && <BuildingView id={sel.id} />}
      {sel.kind === 'asset' && <AssetView asset={city.assets[sel.id]} />}
      {sel.kind === 'bridge' && <BridgeView id={sel.id} />}
      {sel.kind === 'levee' && <LeveeView id={sel.id} />}
      {sel.kind === 'line' && <LineView id={sel.id} />}
      {sel.kind === 'cell' && <CellView cell={sel.id} />}
      <div className="btn-row" style={{ marginTop: 12 }}>
        <button className="btn small" onClick={focusSelection}>
          <IconCamera size={14} /> Focus camera
        </button>
        <button className="btn small" onClick={() => selectObject(null)}>
          Clear selection
        </button>
      </div>
      {!f && <p className="hint">Waiting for simulation data…</p>}
    </div>
  );
}

function Head({ icon, title, sub, status }: { icon: ReactElement; title: string; sub: string; status?: { text: string; color: string } }) {
  return (
    <div className="insp-head">
      <div className="ico">{icon}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <h3>{title}</h3>
        <p>{sub}</p>
      </div>
      {status && (
        <span className="badge" style={{ color: status.color }}>
          {status.text}
        </span>
      )}
    </div>
  );
}

function RelatedEvents({ match }: { match: (e: SimEvent) => boolean }) {
  const evs = runtime.client.events.filter(match).slice(-6).reverse();
  if (!evs.length) return null;
  return (
    <div className="section" style={{ marginTop: 12 }}>
      <div className="section-title">Related events</div>
      <ul className="ev-list">
        {evs.map((e) => (
          <li key={e.id}>
            <button className="ev" onClick={() => (store.set({ rightTab: 'causality' }), selectEvent(e.id, false))}>
              <span className="t">{fmtTick(e.tick).slice(2)}</span>
              <span>
                <span className="title">
                  <i className="cat" style={{ background: CATEGORY[e.category]?.color }} />
                  {e.title}
                </span>
                <span className="sub">{e.causes.length ? 'Why? → view causal chain' : e.detail.slice(0, 80)}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function BuildingView({ id }: { id: number }) {
  const city = runtime.city!;
  const f = runtime.client.frame;
  const b = city.buildings;
  const cell = b.cell[id];
  const st = f?.bState[id] ?? 0;
  const ds = st & 7;
  const pga = f?.peakPGA[cell] ?? 0;
  const res = store.get().scenario?.resilience;
  const med = buildingMedians(b.sclass[id], b.h[id], !!res?.buildingRetrofit, 0);
  const pCollapse = fragility(Math.max(pga, 0.01), med[3], FRAGILITY_BETA);
  const depth = f?.water[cell] ?? 0;
  const district = city.districts[b.district[id]]?.name ?? '';
  return (
    <>
      <Head icon={<IconBuilding />} title={`${BTYPE_NAMES[b.type[id]]} #${id}`} sub={`${district} · built ${b.year[id]}`} status={{ text: DS_NAMES[ds], color: DAMAGE_COLORS[ds] }} />
      <dl className="props">
        <dt>Structure</dt>
        <dd>{SCLASS_NAMES[b.sclass[id]]}</dd>
        <dt>Height / floors</dt>
        <dd>
          {b.h[id].toFixed(0)} m / {b.floors[id]}
        </dd>
        <dt>Footprint</dt>
        <dd>
          {b.w[id].toFixed(0)} × {b.d[id].toFixed(0)} m
        </dd>
        {b.residents[id] > 0 && (
          <>
            <dt>Residents (night)</dt>
            <dd>{Math.round(b.residents[id])}</dd>
          </>
        )}
        <dt>Replacement value</dt>
        <dd>{fmtMoney(b.value[id] * (store.get().scenario?.economics.costScale ?? 1))}</dd>
        <dt>Damage ratio</dt>
        <dd>{((f?.bDamage[id] ?? 0) * 100).toFixed(0)} %</dd>
        <dt>Grid power</dt>
        <dd style={{ color: st & 16 ? undefined : '#ff9a9a' }}>{st & 16 ? 'Energised' : 'No power'}</dd>
        <dt>On fire</dt>
        <dd>{st & 8 ? 'Yes' : 'No'}</dd>
        <dt>Water at site</dt>
        <dd>{depth > 0.02 ? `${depth.toFixed(2)} m` : 'dry'}</dd>
        <dt>Peak shaking</dt>
        <dd>{pga > 0.005 ? `${pga.toFixed(2)} g · MMI ${roman(mmiFromPga(pga))}` : '—'}</dd>
      </dl>
      <div className="section" style={{ marginTop: 12 }}>
        <div className="section-title">Seismic fragility (lognormal, β {FRAGILITY_BETA})</div>
        <div className="hint" style={{ marginBottom: 6 }}>Median PGA for each damage state{res?.buildingRetrofit ? ' (retrofit applied)' : ''}:</div>
        <div className="legend">
          {med.map((m, k) => (
            <span key={k}>
              <i style={{ background: DAMAGE_COLORS[k + 1] }} />
              {DS_NAMES[k + 1]} {m.toFixed(2)} g
            </span>
          ))}
        </div>
        {pga > 0.005 && <p className="hint">At the experienced {pga.toFixed(2)} g the model gives a {(pCollapse * 100).toFixed(1)} % collapse probability for this class.</p>}
      </div>
      <RelatedEvents match={(e) => e.subject?.kind === 'district' && e.subject.id === b.district[id] && e.severity >= 1} />
    </>
  );
}

function assetStatus(a: Asset): { text: string; color: string; code: number } {
  const fa = runtime.client.frame?.assets[a.id];
  if (!fa) return { text: '—', color: '#888', code: 2 };
  const code = fa.status;
  let text = statusName(code);
  if (code === 1 && fa.onBackup) text = 'On backup power';
  return { text, color: statusColor(code), code };
}

function AssetView({ asset: a }: { asset: Asset }) {
  const city = runtime.city!;
  const f = runtime.client.frame;
  const fa = f?.assets[a.id];
  const s = assetStatus(a);
  const deps: { label: string; ok: number; sel?: Selection; note: string }[] = [];
  if (a.substation >= 0) {
    const sub = city.assets[a.substation];
    const en = f?.assets[sub.id]?.energized ?? 1;
    deps.push({ label: sub.name, ok: en ? 2 : 0, sel: { kind: 'asset', id: sub.id }, note: en ? 'grid power available' : 'de-energised' });
  }
  for (const l of city.lines) {
    if (l.b !== a.id && l.a !== a.id) continue;
    const other = city.assets[l.a === a.id ? l.b : l.a];
    const dmg = f?.lines[l.id] === 1;
    deps.push({ label: `${l.name} ↔ ${other.name}`, ok: dmg ? 0 : (f?.assets[other.id]?.energized ?? 1) ? 2 : 1, sel: { kind: 'asset', id: other.id }, note: dmg ? 'line down' : 'line intact' });
  }
  if (a.kind === 'hospital') {
    const ww = city.assets.find((x) => x.kind === 'water')!;
    const w = f?.assets[ww.id]?.status ?? 2;
    deps.push({ label: ww.name, ok: w, sel: { kind: 'asset', id: ww.id }, note: w ? 'water pressure' : 'no municipal water' });
  }
  if (a.kind === 'tower') {
    const hub = city.assets.find((x) => x.kind === 'hub')!;
    deps.push({ label: hub.name, ok: f?.assets[hub.id]?.status ?? 2, sel: { kind: 'asset', id: hub.id }, note: 'fibre backhaul' });
  }
  const served = a.kind === 'sub' ? countServed(a.id) : 0;
  const backupH = fa ? fa.backup / 3600 : a.backupHours;
  const autonomy = a.backupHours * (store.get().scenario?.resilience.backupHoursScale ?? 1);
  return (
    <>
      <Head icon={a.kind === 'sub' || a.kind === 'tx' || a.kind === 'plant' ? <IconPower /> : <IconShield />} title={a.name} sub={`${ASSET_KIND_NAMES[a.kind]} · ${city.districts[a.district]?.name ?? ''} · ${a.year}`} status={{ text: s.text, color: s.color }} />
      <p className="hint" style={{ marginTop: 0 }}>{a.description}</p>
      <dl className="props">
        <dt>Damage state</dt>
        <dd>{DS_NAMES[fa?.ds ?? 0]}</dd>
        <dt>Power</dt>
        <dd>{fa ? (fa.energized ? (fa.onBackup ? 'Backup' : 'Grid') : 'None') : '—'}</dd>
        {autonomy > 0 && (
          <>
            <dt>Backup remaining</dt>
            <dd>
              {backupH.toFixed(1)} of {autonomy.toFixed(1)} h
            </dd>
          </>
        )}
        <dt>Flooded</dt>
        <dd>{fa?.flooded ? `yes (limit ${a.floodLimit} m)` : `no (limit ${a.floodLimit} m)`}</dd>
        {(a.kind === 'hospital' || a.kind === 'shelter' || a.kind === 'fire') && (
          <>
            <dt>Road access</dt>
            <dd style={{ color: fa?.accessible === 0 ? '#ff9a9a' : undefined }}>{fa?.accessible === 0 ? 'Cut off' : 'Connected'}</dd>
          </>
        )}
        {(a.kind === 'hospital' || a.kind === 'shelter') && (
          <>
            <dt>Occupancy</dt>
            <dd>
              {((fa?.load ?? 0) * PEOPLE_PER_AGENT).toLocaleString()} / {(a.capacity * PEOPLE_PER_AGENT).toLocaleString()}
            </dd>
          </>
        )}
        {a.kind === 'pump' && (
          <>
            <dt>Capacity</dt>
            <dd>{(a.capacity * (store.get().scenario?.resilience.pumpCapacityScale ?? 1)).toFixed(1)} m³/s</dd>
          </>
        )}
        {a.kind === 'sub' && (
          <>
            <dt>Buildings served</dt>
            <dd>{served.toLocaleString()}</dd>
          </>
        )}
        <dt>Fragility medians</dt>
        <dd>{a.fragility.map((m) => m.toFixed(2)).join(' / ')} g</dd>
        <dt>Repair cost (illustr.)</dt>
        <dd>{fmtMoney(a.repairCost)}</dd>
      </dl>
      {deps.length > 0 && (
        <div className="section" style={{ marginTop: 12 }}>
          <div className="section-title">Depends on</div>
          <div className="deps">
            {deps.map((d, k) => (
              <button key={k} className="dep" onClick={() => d.sel && selectObject(d.sel)}>
                <span className="dot" style={{ width: 8, height: 8, borderRadius: '50%', background: statusColor(d.ok) }} aria-hidden="true" />
                <span style={{ flex: 1 }}>{d.label}</span>
                <span className="muted">{d.note}</span>
              </button>
            ))}
          </div>
        </div>
      )}
      <RelatedEvents match={(e) => e.subject?.kind === 'asset' && e.subject.id === a.id} />
    </>
  );
}

function countServed(sub: number): number {
  const b = runtime.city!.buildings;
  let n = 0;
  for (let k = 0; k < b.count; k++) if (b.substation[k] === sub) n++;
  return n;
}

function BridgeView({ id }: { id: number }) {
  const br = runtime.city!.bridges[id];
  const ds = runtime.client.frame?.bridges[id] ?? 0;
  const st = ds >= 4 ? { text: 'Collapsed', color: statusColor(0) } : ds >= 3 ? { text: 'Closed', color: statusColor(0) } : ds === 2 ? { text: 'Restricted', color: statusColor(1) } : { text: 'Open', color: statusColor(2) };
  return (
    <>
      <Head icon={<IconBridge />} title={br.name} sub={`${br.style === 'cable' ? 'Cable-stayed' : br.style === 'arch' ? 'Steel arch' : 'Girder'} bridge · ${br.year}`} status={st} />
      <dl className="props">
        <dt>Damage state</dt>
        <dd>{DS_NAMES[ds]}</dd>
        <dt>Span over river</dt>
        <dd>{br.cells.length * 32} m</dd>
        <dt>Deck elevation</dt>
        <dd>{br.deckY.toFixed(1)} m</dd>
        <dt>Fragility medians</dt>
        <dd>{br.fragility.map((m) => m.toFixed(2)).join(' / ')} g</dd>
        <dt>Repair cost (illustr.)</dt>
        <dd>{fmtMoney(br.repairCost)}</dd>
      </dl>
      <p className="hint">Liquefaction at the abutments increases the seismic demand (lateral spreading). Extensive damage closes the bridge; collapse drops the span.</p>
      <RelatedEvents match={(e) => e.subject?.kind === 'bridge' && e.subject.id === id} />
    </>
  );
}

function LeveeView({ id }: { id: number }) {
  const city = runtime.city!;
  const seg = city.levees[id];
  const f = runtime.client.frame;
  let minCrest = Infinity;
  for (const c of seg.cells) minCrest = Math.min(minCrest, city.terrain[c] - (f?.settlement[c] ?? 0) + (f?.levee[c] ?? city.leveeHeight[c]));
  const state = f?.levees[id] ?? 0;
  const sea = f?.eff.seaSurface ?? 0;
  return (
    <>
      <Head icon={<IconShield />} title={seg.name} sub="Seawall protecting the Eastport polder" status={state === 2 ? { text: 'Breached', color: statusColor(0) } : state === 1 ? { text: 'Overtopped', color: statusColor(1) } : { text: 'Holding', color: statusColor(2) }} />
      <dl className="props">
        <dt>Design crest</dt>
        <dd>{(seg.crest + (store.get().scenario?.resilience.leveeRaise ?? 0)).toFixed(2)} m</dd>
        <dt>Lowest crest now</dt>
        <dd>{minCrest.toFixed(2)} m</dd>
        <dt>Sea surface now</dt>
        <dd>{sea.toFixed(2)} m</dd>
        <dt>Freeboard</dt>
        <dd style={{ color: minCrest - sea < 0.5 ? '#ff9a9a' : undefined }}>{(minCrest - sea).toFixed(2)} m</dd>
        <dt>Length</dt>
        <dd>{seg.cells.length * 32} m</dd>
      </dl>
      <p className="hint">Liquefaction lowers the embankment; water overtopping it erodes the crest until a breach opens.</p>
      <RelatedEvents match={(e) => e.subject?.kind === 'levee' && e.subject.id === id} />
    </>
  );
}

function LineView({ id }: { id: number }) {
  const l = runtime.city!.lines[id];
  const dmg = runtime.client.frame?.lines[id] === 1;
  return (
    <>
      <Head icon={<IconPower />} title={l.name} sub={`${l.kind === 'transmission' ? 'Transmission' : 'Sub-transmission'} line`} status={dmg ? { text: 'Down', color: statusColor(0) } : { text: 'Intact', color: statusColor(2) }} />
      <dl className="props">
        <dt>Wind rating</dt>
        <dd>{l.windRating} m/s gust</dd>
        <dt>Seismic median</dt>
        <dd>{l.quakeMedian.toFixed(2)} g</dd>
        <dt>Pylons</dt>
        <dd>{l.points.length / 2}</dd>
      </dl>
      <RelatedEvents match={(e) => e.subject?.kind === 'line' && e.subject.id === id} />
    </>
  );
}

function CellView({ cell }: { cell: number }) {
  const city = runtime.city!;
  const f = runtime.client.frame;
  if (cell < 0 || cell >= N_CELLS) return null;
  const d = city.district[cell];
  const depth = f?.water[cell] ?? 0;
  const pga = f?.peakPGA[cell] ?? 0;
  const sat = f?.eff.soilSaturation ?? 0.5;
  return (
    <>
      <Head icon={<IconCell />} title={`Ground cell ${cell % GRID}, ${Math.floor(cell / GRID)}`} sub={`${ZONE_NAMES[city.zone[cell]]}${d >= 0 ? ` · ${city.districts[d].name}` : ''} · 32 × 32 m`} />
      <dl className="props">
        <dt>Elevation</dt>
        <dd>{(city.terrain[cell] - (f?.settlement[cell] ?? 0)).toFixed(2)} m</dd>
        <dt>Water depth</dt>
        <dd>{depth > 0.005 ? `${depth.toFixed(2)} m` : 'dry'}</dd>
        <dt>Soil susceptibility</dt>
        <dd>{(city.soil[cell] * 100).toFixed(0)} %</dd>
        <dt>Settlement</dt>
        <dd>{((f?.settlement[cell] ?? 0) * 100).toFixed(0)} cm</dd>
        <dt>Peak shaking</dt>
        <dd>{pga > 0.005 ? `${pga.toFixed(2)} g · MMI ${roman(mmiFromPga(pga))}` : '—'}</dd>
        <dt>Settlement at 0.4 g</dt>
        <dd>{(liquefactionSettlement(0.4, city.soil[cell], sat) * 100).toFixed(0)} cm (model)</dd>
        <dt>Fire intensity</dt>
        <dd>{f && f.burn[cell] > 0 ? `${(f.burn[cell] * 100).toFixed(0)} %` : 'none'}</dd>
        <dt>Smoke</dt>
        <dd>{(f?.smoke[cell] ?? 0).toFixed(2)}</dd>
        <dt>Coordinates</dt>
        <dd>
          {fmtLocation(cellX(cell % GRID), cellZ(Math.floor(cell / GRID)))}
        </dd>
      </dl>
    </>
  );
}

function CityOverview() {
  const city = runtime.city;
  if (!city) return null;
  return (
    <div className="section" style={{ marginTop: 14 }}>
      <div className="section-title">Meridian Bay</div>
      <dl className="props">
        <dt>Buildings</dt>
        <dd>{city.buildings.count.toLocaleString()}</dd>
        <dt>Road network</dt>
        <dd>
          {city.stats.roadLengthKm.toFixed(0)} km · {city.roads.nodeCount} junctions
        </dd>
        <dt>Bridges</dt>
        <dd>{city.bridges.length}</dd>
        <dt>Critical facilities</dt>
        <dd>{city.assets.length}</dd>
        <dt>Districts</dt>
        <dd>{city.districts.length}</dd>
      </dl>
      <div className="deps" style={{ marginTop: 10 }}>
        {city.assets
          .filter((a) => a.kind === 'hospital' || a.kind === 'pump' || a.kind === 'plant' || a.kind === 'water')
          .map((a) => {
            const s = assetStatus(a);
            return (
              <button key={a.id} className="dep" onClick={() => selectObject({ kind: 'asset', id: a.id })}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: s.color }} aria-hidden="true" />
                <span style={{ flex: 1 }}>{a.name}</span>
                <span className="muted">{s.text}</span>
              </button>
            );
          })}
      </div>
    </div>
  );
}

function roman(v: number): string {
  const r = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];
  return r[Math.max(0, Math.min(11, Math.floor(v) - 1))];
}
