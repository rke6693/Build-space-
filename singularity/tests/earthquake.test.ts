import { describe, expect, it } from 'vitest';
import { FRAGILITY } from '../src/sim/city/generate';
import { Simulation } from '../src/sim/engine';
import { buildingMedians, damageState, envelope, liquefactionSettlement, mmiFromPga, pgaRock, siteAmplification, significantDuration } from '../src/sim/systems/earthquake';
import { minutesToTicks } from '../src/sim/scenario';
import { allFinite, scenario, testCity } from './helpers';

describe('ground motion model', () => {
  it('attenuates with distance and grows with magnitude', () => {
    for (const M of [5, 6, 7, 8]) {
      let prev = Infinity;
      for (const R of [2, 5, 10, 20, 50, 100]) {
        const p = pgaRock(M, R);
        expect(p).toBeLessThan(prev);
        prev = p;
      }
    }
    for (const R of [5, 20, 60]) expect(pgaRock(7, R)).toBeGreaterThan(pgaRock(6, R));
  });
  it('is calibrated to plausible values', () => {
    expect(pgaRock(7, 10)).toBeGreaterThan(0.25);
    expect(pgaRock(7, 10)).toBeLessThan(0.5);
    expect(pgaRock(5, 20)).toBeLessThan(0.15);
    expect(pgaRock(9, 1)).toBeLessThanOrEqual(3);
    expect(mmiFromPga(0.3)).toBeGreaterThan(7);
    expect(mmiFromPga(0.3)).toBeLessThan(9);
    expect(mmiFromPga(0)).toBe(1);
  });
  it('amplifies on soft saturated soil', () => {
    expect(siteAmplification(0, 1)).toBe(1);
    expect(siteAmplification(1, 1)).toBeGreaterThan(siteAmplification(1, 0));
    expect(siteAmplification(1, 1)).toBeLessThanOrEqual(2);
  });
  it('has a bounded shaking envelope and magnitude-dependent duration', () => {
    for (let u = -5; u < 200; u += 0.5) {
      const e = envelope(u, 20);
      expect(e).toBeGreaterThanOrEqual(0);
      expect(e).toBeLessThanOrEqual(1);
    }
    expect(significantDuration(7.5)).toBeGreaterThan(significantDuration(6));
  });
  it('yields nested, monotonic damage states', () => {
    const med = FRAGILITY[1];
    for (let u = 0.05; u < 1; u += 0.1) {
      let prev = 0;
      for (let pga = 0.02; pga < 2; pga += 0.05) {
        const ds = damageState(pga, med, 0.55, u);
        expect(ds).toBeGreaterThanOrEqual(prev);
        prev = ds;
      }
    }
    // prior damage weakens; retrofit strengthens
    expect(buildingMedians(1, 10, false, 2)[3]).toBeLessThan(buildingMedians(1, 10, false, 0)[3]);
    expect(buildingMedians(1, 10, true, 0)[3]).toBeGreaterThan(buildingMedians(1, 10, false, 0)[3]);
  });
  it('liquefies only susceptible soils above a threshold', () => {
    expect(liquefactionSettlement(0.6, 0.1, 1)).toBe(0);
    expect(liquefactionSettlement(0.05, 1, 1)).toBe(0);
    expect(liquefactionSettlement(0.5, 1, 1)).toBeGreaterThan(liquefactionSettlement(0.3, 1, 1));
    expect(liquefactionSettlement(3, 1, 1)).toBeLessThanOrEqual(0.6 * 1.2 + 1e-9);
  });
});

describe('earthquake in the engine', () => {
  const city = testCity();
  it('propagates, damages buildings, triggers aftershocks and summarises', () => {
    const sim = new Simulation(scenario({ commands: [{ id: 1, tick: 5, source: 'scenario', spec: { kind: 'earthquake', x: 300, z: 1500, magnitude: 7.0, depthKm: 10, aftershocks: true } }] }), city);
    let maxShake = 0;
    for (let k = 0; k < minutesToTicks(40); k++) {
      sim.step();
      for (let c = 0; c < sim.shaking.length; c += 97) maxShake = Math.max(maxShake, sim.shaking[c]);
    }
    expect(maxShake).toBeGreaterThan(0.1);
    const m = sim.metrics();
    expect(m.bSlight + m.bModerate + m.bExtensive + m.bCollapsed).toBeGreaterThan(100);
    expect(m.peakPGA).toBeGreaterThan(0.2);
    expect(sim.events.some((e) => e.type === 'earthquake')).toBe(true);
    expect(sim.events.some((e) => e.type === 'aftershock')).toBe(true);
    expect(sim.events.some((e) => e.type === 'building_damage' || e.type === 'building_collapse')).toBe(true);
    // every damage summary cites an earthquake
    for (const e of sim.events.filter((x) => x.type === 'building_collapse')) {
      expect(e.causes.length).toBeGreaterThan(0);
      expect(['earthquake', 'aftershock']).toContain(sim.events[e.causes[0]].type);
    }
    expect(allFinite(sim.s.settlement)).toBe(true);
    // shaking stops once all quakes are done
    expect(sim.s.quakes.every((q) => q.done || !q.aftershock)).toBe(true);
  });
  it('stronger quakes cause more damage than weaker ones (same seed)', () => {
    const run = (M: number) => {
      const sim = new Simulation(scenario({ resilience: { ...scenario().resilience, aftershocks: false }, commands: [{ id: 1, tick: 2, source: 'scenario', spec: { kind: 'earthquake', x: 0, z: 1200, magnitude: M, depthKm: 10, aftershocks: false } }] }), city);
      for (let k = 0; k < 200; k++) sim.step();
      const m = sim.metrics();
      return m.bModerate + 2 * m.bExtensive + 3 * m.bCollapsed;
    };
    expect(run(7.2)).toBeGreaterThan(run(6.0));
  });
});
