import { describe, expect, it } from 'vitest';
import { Simulation } from '../src/sim/engine';
import { causalChain, rootCauses } from '../src/sim/events';
import { minutesToTicks } from '../src/sim/scenario';
import { scenario, testCity } from './helpers';

describe('infrastructure dependencies and cascades', () => {
  const city = testCity();
  const eastportSub = city.assets.find((a) => a.name === 'Eastport Substation')!;
  const pumps = city.assets.filter((a) => a.kind === 'pump');

  it('substation failure → pumps on backup → backup exhausted → pumps stop (with causal chain)', () => {
    const sim = new Simulation(scenario({ resilience: { ...scenario().resilience, backupHoursScale: 0.25 }, commands: [{ id: 1, tick: 2, source: 'scenario', spec: { kind: 'asset', assetId: eastportSub.id, action: 'damage' } }] }), city);
    for (let k = 0; k < 10; k++) sim.step();
    expect(sim.s.aEnergized[eastportSub.id]).toBe(0);
    for (const p of pumps) {
      expect(sim.s.aOnBackup[p.id]).toBe(1);
      expect(sim.s.aOperational[p.id]).toBe(1);
    }
    // buildings served by the substation lose power
    const b = city.buildings;
    let served = 0;
    let dark = 0;
    for (let k = 0; k < b.count; k++) {
      if (b.substation[k] !== eastportSub.id) continue;
      served++;
      if (!sim.bPowered[k]) dark++;
    }
    expect(served).toBeGreaterThan(50);
    expect(dark).toBe(served);
    // 1.5 h * 0.25 = 22.5 min of diesel
    for (let k = 0; k < minutesToTicks(25); k++) sim.step();
    for (const p of pumps) expect(sim.s.aOperational[p.id]).toBe(0);
    const stop = sim.events.find((e) => e.type === 'pump_failure')!;
    expect(stop).toBeDefined();
    const chain = causalChain(sim.events, stop.id).map((l) => l.event.type);
    expect(chain).toContain('backup_exhausted');
    expect(chain).toContain('backup_start');
    expect(chain).toContain('power_loss');
    expect(chain).toContain('substation_damage');
    const roots = rootCauses(sim.events, stop.id);
    expect(roots.length).toBeGreaterThan(0);
    expect(roots[0].type).toBe('substation_damage');
  });

  it('loss of the only generating paths blacks out the grid; redundancy keeps downtown lit', () => {
    const plant = city.assets.find((a) => a.kind === 'plant')!;
    const imp = city.assets.find((a) => a.kind === 'import')!;
    const sim = new Simulation(scenario({ commands: [{ id: 1, tick: 1, source: 'scenario', spec: { kind: 'asset', assetId: plant.id, action: 'damage' } }] }), city);
    for (let k = 0; k < 5; k++) sim.step();
    // the interconnect still feeds both transmission subs through the tie line
    expect(sim.metrics().gridAvailability).toBeGreaterThan(0.95);
    sim.addCommand({ id: 2, tick: sim.tick, source: 'interactive', spec: { kind: 'asset', assetId: imp.id, action: 'damage' } });
    for (let k = 0; k < 5; k++) sim.step();
    expect(sim.metrics().gridAvailability).toBe(0);
    expect(sim.metrics().substationsOnline).toBe(0);
  });

  it('telecom exchange outage takes down every cell tower', () => {
    const hub = city.assets.find((a) => a.kind === 'hub')!;
    const sim = new Simulation(scenario({ commands: [{ id: 1, tick: 1, source: 'scenario', spec: { kind: 'asset', assetId: hub.id, action: 'damage' } }] }), city);
    for (let k = 0; k < 5; k++) sim.step();
    expect(sim.s.commOk).toBe(0);
    expect(sim.metrics().commAvailability).toBe(0);
    const outage = sim.events.find((e) => e.type === 'comm_outage' && e.title.includes('exchange'))!;
    expect(sim.events[outage.causes[0]].type).toBe('critical_damage');
  });

  it('water works outage degrades hospitals', () => {
    const ww = city.assets.find((a) => a.kind === 'water')!;
    const sim = new Simulation(scenario({ commands: [{ id: 1, tick: 1, source: 'scenario', spec: { kind: 'asset', assetId: ww.id, action: 'damage' } }] }), city);
    for (let k = 0; k < 5; k++) sim.step();
    expect(sim.s.waterOk).toBe(0);
    for (const h of city.assets.filter((a) => a.kind === 'hospital')) expect(sim.s.aOperational[h.id]).toBe(1);
    expect(sim.events.some((e) => e.type === 'hospital_degraded' && e.causes.includes(sim.s.waterEvent))).toBe(true);
  });

  it('closing every road around a hospital isolates it and records why', () => {
    const hosp = city.assets.find((a) => a.name.startsWith('Eastport Medical'))!;
    const sim = new Simulation(scenario(), city);
    sim.step();
    const g = city.roads;
    // debris on every edge within ~250 m of the hospital
    for (let e = 0; e < g.edgeCount; e++) {
      const dx = sim.d.edgeMid[e * 2] - hosp.x;
      const dz = sim.d.edgeMid[e * 2 + 1] - hosp.z;
      if (dx * dx + dz * dz < 260 * 260) {
        sim.s.eDebris[e] = 1;
      }
    }
    for (let k = 0; k < 40; k++) sim.step();
    expect(sim.s.aAccessible[hosp.id]).toBe(0);
    const ev = sim.events.find((e) => e.type === 'hospital_isolated');
    expect(ev).toBeDefined();
    expect(ev!.causes.length).toBeGreaterThan(0);
    expect(sim.events[ev!.causes[0]].type).toBe('road_closure');
  });
});
