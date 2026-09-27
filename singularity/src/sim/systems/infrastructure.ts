import { STEP_SECONDS } from '../config';
import type { Simulation } from '../engine';
import type { Asset } from '../types';

/**
 * Infrastructure dependency model.
 *
 *   plant / interconnect ──lines──▶ transmission subs ──lines──▶ distribution subs
 *   distribution sub ──▶ consumers (pumps, water works, hospitals, fire stations, shelters,
 *                                   telecom exchange, cell towers, buildings)
 *   telecom exchange ──▶ cell towers (backhaul)      water works ──▶ hospitals, hydrants
 *
 * Each step: physical state (damage, flooding, protective trips) → power flow (graph
 * reachability from live sources over intact lines) → consumers switch to backup power
 * with finite autonomy → derived services (telecom, water, pumps, hospitals).
 * Every state transition is emitted as an event citing the events that caused it.
 */
export function updateInfrastructure(sim: Simulation) {
  const s = sim.s;
  const city = sim.city;
  const d = sim.d;
  const dt = STEP_SECONDS;
  const assets = city.assets;
  const res = sim.scenario.resilience;

  // 1) protective trips and flooding
  for (const a of assets) {
    const id = a.id;
    if (s.aTrip[id] > 0) s.aTrip[id] = Math.max(0, s.aTrip[id] - dt);
    const depth = s.water[a.cell];
    const flooded = depth > a.floodLimit ? 1 : depth < a.floodLimit * 0.7 ? 0 : s.aFlooded[id];
    if (flooded !== s.aFlooded[id]) {
      s.aFlooded[id] = flooded;
      if (flooded) {
        s.aFloodEvent[id] = sim.emit({
          type: 'critical_damage',
          category: 'flood',
          severity: a.kind === 'tower' || a.kind === 'fire' ? 1 : a.kind === 'shelter' ? 2 : 3,
          title: `${a.name} flooded`,
          detail: `Water ${depth.toFixed(2)} m deep at the site exceeds its ${a.floodLimit.toFixed(1)} m equipment limit.`,
          x: a.x,
          z: a.z,
          causes: sim.floodCauses(a.cell),
          subject: { kind: 'asset', id },
          radius: 450,
        });
      }
    }
  }
  const functional = (id: number) => s.aDS[id] < 3 && !s.aFlooded[id] && s.aTrip[id] <= 0;

  // 2) power flow over the transmission graph
  const en = sim.tmpEnergized;
  en.fill(0);
  for (const id of d.assetsByKind.plant) en[id] = functional(id) ? 1 : 0;
  for (const id of d.assetsByKind.import) en[id] = functional(id) ? 1 : 0;
  for (let pass = 0; pass < 4; pass++) {
    let changed = false;
    for (const l of city.lines) {
      if (s.lDamaged[l.id]) continue;
      if (en[l.a] && !en[l.b] && functional(l.b) && assets[l.b].kind !== 'plant' && assets[l.b].kind !== 'import') {
        en[l.b] = 1;
        changed = true;
      }
      if (en[l.b] && !en[l.a] && functional(l.a) && assets[l.a].kind === 'tx' && assets[l.b].kind === 'tx') {
        en[l.a] = 1;
        changed = true;
      }
    }
    if (!changed) break;
  }
  for (const id of d.gridNodes) {
    const now = en[id];
    if (now === s.aEnergized[id]) continue;
    const a = assets[id];
    s.aEnergized[id] = now;
    s.aOperational[id] = now ? 2 : 0;
    if (!now) {
      const causes = gridLossCauses(sim, a);
      const served = a.kind === 'sub' ? sim.buildingsServedBy(id) : 0;
      s.aEvent[id] = sim.emit({
        type: 'power_loss',
        category: 'power',
        severity: a.kind === 'sub' ? 2 : 3,
        title: a.kind === 'plant' || a.kind === 'import' ? `${a.name} offline` : `${a.name} de-energized`,
        detail: a.kind === 'sub' ? `${served} buildings in ${city.districts[a.district].name} lose grid power. ${describeGridCause(sim, a)}` : describeGridCause(sim, a),
        x: a.x,
        z: a.z,
        causes,
        subject: { kind: 'asset', id },
        radius: a.kind === 'sub' ? 900 : 1400,
      });
    } else {
      s.aEvent[id] = sim.emit({
        type: 'power_restored',
        category: 'power',
        severity: 1,
        title: `${a.name} re-energized`,
        detail: 'Supply path restored (protective trip cleared or upstream repaired).',
        x: a.x,
        z: a.z,
        causes: [],
        subject: { kind: 'asset', id },
        radius: 700,
      });
    }
  }

  // 3) consumers: grid → backup → dark
  for (const id of d.consumers) {
    const a = assets[id];
    const grid = s.aEnergized[a.substation] === 1;
    const intact = s.aDS[id] < 3 && !s.aFlooded[id];
    const autonomy = a.backupHours * res.backupHoursScale;
    let powered = 0;
    if (grid) {
      powered = 1;
      s.aOnBackup[id] = 0;
    } else if (intact && autonomy > 0 && s.aBackup[id] > 0) {
      if (!s.aOnBackup[id]) {
        s.aOnBackup[id] = 1;
        const important = a.kind === 'pump' || a.kind === 'hospital' || a.kind === 'hub' || a.kind === 'water';
        s.aBackupEvent[id] = sim.emit({
          type: 'backup_start',
          category: 'power',
          severity: important ? 2 : 0,
          title: `${a.name} switched to backup power`,
          detail: `${a.kind === 'tower' ? 'Battery' : 'Generator'} autonomy ≈ ${(s.aBackup[id] / 3600).toFixed(1)} h at current load.`,
          x: a.x,
          z: a.z,
          causes: [s.aEvent[a.substation]],
          subject: { kind: 'asset', id },
          radius: 500,
        });
        s.aEvent[id] = s.aBackupEvent[id];
      }
      s.aBackup[id] -= dt;
      if (s.aBackup[id] <= 0) {
        s.aBackup[id] = 0;
        s.aOnBackup[id] = 0;
        const critical = a.kind === 'pump' || a.kind === 'hospital' || a.kind === 'hub';
        s.aEvent[id] = s.aBackupEvent[id] = sim.emit({
          type: 'backup_exhausted',
          category: 'power',
          severity: critical ? 3 : 1,
          title: `${a.name} backup power exhausted`,
          detail: `${a.kind === 'tower' ? 'Batteries' : 'Diesel reserve'} ran out after ${(autonomy).toFixed(1)} h; grid supply is still unavailable.`,
          x: a.x,
          z: a.z,
          causes: [s.aBackupEvent[id], s.aEvent[a.substation]],
          subject: { kind: 'asset', id },
          radius: 500,
        });
      } else powered = 1;
    } else {
      s.aOnBackup[id] = 0;
    }
    s.aEnergized[id] = powered;
  }

  // 4) telecom exchange and cell towers
  const hub = d.assetsByKind.hub[0];
  if (hub !== undefined) {
    const ok = s.aEnergized[hub] && s.aDS[hub] < 3 && !s.aFlooded[hub] ? 1 : 0;
    if (ok !== s.commOk) {
      s.commOk = ok;
      s.commEvent = sim.emit({
        type: ok ? 'comm_restored' : 'comm_outage',
        category: 'comms',
        severity: ok ? 1 : 3,
        title: ok ? 'Telecom exchange back online' : 'Telecom exchange down — citywide mobile outage',
        detail: ok ? 'Cell towers can reach the core network again.' : 'All cell towers lose backhaul: evacuation alerts and emergency dispatch degrade.',
        x: assets[hub].x,
        z: assets[hub].z,
        causes: ok ? [] : consumerCauses(sim, assets[hub]),
        subject: { kind: 'asset', id: hub },
        radius: 1500,
      });
    }
    setOperational(sim, hub, ok ? (s.aOnBackup[hub] ? 1 : 2) : 0);
  }
  let towersChanged = false;
  for (const id of d.assetsByKind.tower) {
    const up = s.commOk && s.aEnergized[id] && s.aDS[id] < 3 && !s.aFlooded[id] ? (s.aOnBackup[id] ? 1 : 2) : 0;
    if ((up > 0) !== (s.aOperational[id] > 0)) {
      towersChanged = true;
      const a = assets[id];
      if (!up) {
        s.aEvent[id] = sim.emit({
          type: 'comm_outage',
          category: 'comms',
          severity: 1,
          title: `${a.name} offline`,
          detail: !s.commOk ? 'No backhaul to the telecom exchange.' : 'Site lost power or was damaged.',
          x: a.x,
          z: a.z,
          causes: !s.commOk ? [s.commEvent] : consumerCauses(sim, a),
          subject: { kind: 'asset', id },
          radius: 800,
        });
      }
    }
    s.aOperational[id] = up;
  }
  if (towersChanged) sim.recomputeCommCover();

  // 5) water works
  const ww = d.assetsByKind.water[0];
  if (ww !== undefined) {
    const ok = s.aEnergized[ww] && s.aDS[ww] < 3 && !s.aFlooded[ww];
    const level = ok ? (s.aDS[ww] === 2 ? 0.5 : 1) : 0;
    if ((level > 0) !== (s.waterOk > 0)) {
      s.waterEvent = sim.emit({
        type: level > 0 ? 'water_restored' : 'water_outage',
        category: 'water',
        severity: level > 0 ? 1 : 3,
        title: level > 0 ? 'Water pressure restored' : `${assets[ww].name} offline — hydrant pressure lost`,
        detail: level > 0 ? 'Treatment and high-lift pumping resumed.' : 'Firefighting falls back to tankers (~35 % effectiveness); hospitals switch to limited operation.',
        x: assets[ww].x,
        z: assets[ww].z,
        causes: level > 0 ? [] : consumerCauses(sim, assets[ww]),
        subject: { kind: 'asset', id: ww },
        radius: 900,
      });
      s.aEvent[ww] = s.waterEvent;
    }
    s.waterOk = level;
    setOperational(sim, ww, level >= 1 ? (s.aOnBackup[ww] ? 1 : 2) : level > 0 ? 1 : 0);
  }

  // 6) flood pumps
  for (const id of d.assetsByKind.pump) {
    const a = assets[id];
    const up = s.aEnergized[id] && s.aDS[id] < 3 && !s.aFlooded[id] ? (s.aOnBackup[id] ? 1 : 2) : 0;
    const was = s.aOperational[id];
    if ((up > 0) !== (was > 0)) {
      s.aEvent[id] = sim.emit({
        type: up ? 'pump_restored' : 'pump_failure',
        category: 'flood',
        severity: up ? 1 : 3,
        title: up ? `${a.name} pumping again` : `${a.name} stopped`,
        detail: up ? 'Drainage of the polder catchment resumed.' : `Polder drainage in its catchment stops; rain and seepage now accumulate below sea level. Capacity lost: ${a.capacity.toFixed(1)} m³/s.`,
        x: a.x,
        z: a.z,
        causes: up ? [] : consumerCauses(sim, a),
        subject: { kind: 'asset', id },
        radius: 700,
      });
    }
    s.aOperational[id] = up;
  }

  // 7) hospitals
  for (const id of d.assetsByKind.hospital) {
    const a = assets[id];
    let lvl = 0;
    if (s.aEnergized[id] && s.aDS[id] < 3 && !s.aFlooded[id]) lvl = s.waterOk < 1 || s.aDS[id] === 2 || s.aOnBackup[id] ? 1 : 2;
    const was = s.aOperational[id];
    if (lvl !== was) {
      if (lvl < was) {
        const causes = lvl === 0 ? consumerCauses(sim, a) : [s.aOnBackup[id] ? s.aBackupEvent[id] : -1, s.waterOk < 1 ? s.waterEvent : -1, s.aDS[id] === 2 ? s.aDamageEvent[id] : -1];
        s.aEvent[id] = sim.emit({
          type: 'hospital_degraded',
          category: 'health',
          severity: lvl === 0 ? 3 : 2,
          title: lvl === 0 ? `${a.name} out of service` : `${a.name} on limited operations`,
          detail: lvl === 0 ? 'No power or the building is unusable; patients must be diverted.' : [s.aOnBackup[id] ? 'running on generators' : '', s.waterOk < 1 ? 'no municipal water' : '', s.aDS[id] === 2 ? 'structural damage' : ''].filter(Boolean).join(', '),
          x: a.x,
          z: a.z,
          causes,
          subject: { kind: 'asset', id },
          radius: 600,
        });
      } else if (lvl === 2) {
        s.aEvent[id] = sim.emit({
          type: 'hospital_restored',
          category: 'health',
          severity: 1,
          title: `${a.name} fully operational`,
          detail: 'Grid power and water restored.',
          x: a.x,
          z: a.z,
          causes: [],
          subject: { kind: 'asset', id },
          radius: 600,
        });
      }
      s.aOperational[id] = lvl;
      sim.routingDirty();
    }
  }

  // 8) fire stations, shelters, EOC
  for (const id of d.assetsByKind.fire) setOperational(sim, id, s.aDS[id] < 3 && !s.aFlooded[id] ? (s.aEnergized[id] ? 2 : 1) : 0);
  for (const id of d.assetsByKind.shelter) {
    const lvl = s.aDS[id] < 3 && !s.aFlooded[id] ? (s.aEnergized[id] ? 2 : 1) : 0;
    if ((lvl > 0) !== (s.aOperational[id] > 0)) sim.routingDirty();
    setOperational(sim, id, lvl);
  }
  for (const id of d.assetsByKind.eoc) setOperational(sim, id, s.aDS[id] < 3 && !s.aFlooded[id] ? (s.aEnergized[id] ? (s.aOnBackup[id] ? 1 : 2) : 0) : 0);

  // 9) building service
  const b = city.buildings;
  const bp = sim.bPowered;
  for (let k = 0; k < b.count; k++) bp[k] = s.aEnergized[b.substation[k]] && s.bDS[k] < 4 ? 1 : 0;
}

function setOperational(sim: Simulation, id: number, lvl: number) {
  sim.s.aOperational[id] = lvl;
}

/** Why did a grid node lose power? Own damage/flood/trip first, then upstream. */
function gridLossCauses(sim: Simulation, a: Asset): number[] {
  const s = sim.s;
  const out: number[] = [];
  if (s.aDS[a.id] >= 3) out.push(s.aDamageEvent[a.id]);
  if (s.aFlooded[a.id]) out.push(s.aFloodEvent[a.id]);
  if (s.aTrip[a.id] > 0) out.push(s.aTripEvent[a.id]);
  if (out.length) return out;
  for (const l of sim.city.lines) {
    if (l.b !== a.id && l.a !== a.id) continue;
    const other = l.a === a.id ? l.b : l.a;
    if (s.lDamaged[l.id]) out.push(s.lEvent[l.id]);
    else if (!s.aEnergized[other] || !sim.tmpEnergized[other]) out.push(s.aEvent[other]);
  }
  return out;
}

function describeGridCause(sim: Simulation, a: Asset): string {
  const s = sim.s;
  if (s.aDS[a.id] >= 3) return 'Equipment damaged.';
  if (s.aFlooded[a.id]) return 'Switchgear flooded.';
  if (s.aTrip[a.id] > 0) return 'Protective relays tripped.';
  const feeds = sim.city.lines.filter((l) => l.b === a.id || l.a === a.id);
  if (feeds.length && feeds.every((l) => s.lDamaged[l.id])) return 'All supply lines are down.';
  return 'No energised supply path from a generating source.';
}

/** Why is a consumer asset down? */
export function consumerCauses(sim: Simulation, a: Asset): number[] {
  const s = sim.s;
  const out: number[] = [];
  if (s.aDS[a.id] >= 3) out.push(s.aDamageEvent[a.id]);
  if (s.aFlooded[a.id]) out.push(s.aFloodEvent[a.id]);
  if (!s.aEnergized[a.id]) {
    if (s.aBackupEvent[a.id] >= 0 && s.aBackup[a.id] <= 0) out.push(s.aBackupEvent[a.id]);
    else if (a.substation >= 0) out.push(s.aEvent[a.substation]);
  }
  return out;
}
