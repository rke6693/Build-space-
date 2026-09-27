import { describe, expect, it } from 'vitest';
import { MAX_EVENTS } from '../src/sim/config';
import { SimController } from '../src/sim/controller';
import { Simulation } from '../src/sim/engine';
import { allFinite, scenario, testCity } from './helpers';

describe('numerical robustness under extreme parameters', () => {
  it('survives every hazard at maximum intensity without NaN or runaway growth', () => {
    const sc = scenario({
      agents: 1500,
      env: { rainfall: 200, windSpeed: 80, windDir: 180, temperature: 50, seaLevel: 4, soilSaturation: 1 },
      commands: [
        { id: 1, tick: 1, source: 'scenario', spec: { kind: 'earthquake', x: 0, z: 0, magnitude: 9, depthKm: 1, aftershocks: true } },
        { id: 2, tick: 2, source: 'scenario', spec: { kind: 'storm', category: 5, dirDeg: 180, durationMin: 60, lightning: true } },
        { id: 3, tick: 3, source: 'scenario', spec: { kind: 'surge', height: 8, durationMin: 60 } },
        { id: 4, tick: 4, source: 'scenario', spec: { kind: 'river_flood', peak: 5000, durationMin: 60 } },
        { id: 5, tick: 5, source: 'scenario', spec: { kind: 'rain', rate: 300, durationMin: 60 } },
        { id: 6, tick: 6, source: 'scenario', spec: { kind: 'fire', x: 0, z: -900, radius: 4 } },
        { id: 7, tick: 7, source: 'scenario', spec: { kind: 'levee_breach', segment: 1, width: 8 } },
      ],
    });
    const sim = new Simulation(sc, testCity());
    for (let k = 0; k < 900; k++) sim.step();
    const s = sim.s;
    for (const a of [s.water, s.qx, s.qz, s.burn, s.heat, s.fuel, s.smoke, s.settlement, s.levee, s.peakPGA, s.agents.x, s.agents.z, s.agents.health]) expect(allFinite(a)).toBe(true);
    const m = sim.metrics();
    for (const [k, v] of Object.entries(m)) expect(Number.isFinite(v), k).toBe(true);
    let maxH = 0;
    for (const h of s.water) maxH = Math.max(maxH, h);
    expect(maxH).toBeLessThan(60);
    expect(sim.events.length).toBeLessThan(MAX_EVENTS);
    expect(s.strikes.length).toBeLessThanOrEqual(24);
    expect(s.quakes.length).toBeLessThanOrEqual(24);
    expect(s.incidents.length).toBeLessThanOrEqual(161);
    expect(m.gridAvailability).toBeLessThan(0.5);
  });

  it('stops at the scenario end instead of running away', () => {
    const ctl = new SimController(scenario({ durationMin: 5, agents: 200 }), testCity());
    const n = ctl.advance(100000);
    expect(n).toBe(150);
    expect(ctl.stepOnce()).toBe(false);
  });
});
