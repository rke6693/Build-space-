import { describe, expect, it } from 'vitest';
import { CELL_AREA, GRID, N_CELLS } from '../src/sim/config';
import { Simulation } from '../src/sim/engine';
import { makeFloodWork, routeWater } from '../src/sim/systems/flood';
import { minutesToTicks } from '../src/sim/scenario';
import { allFinite, scenario, testCity } from './helpers';

function volume(h: Float32Array): number {
  let v = 0;
  for (let c = 0; c < N_CELLS; c++) v += h[c] * CELL_AREA;
  return v;
}

describe('flood routing numerics', () => {
  const manning = new Float32Array(N_CELLS).fill(0.04);

  it('conserves mass in a closed basin (dam break)', () => {
    const z = new Float32Array(N_CELLS);
    for (let c = 0; c < N_CELLS; c++) z[c] = Math.sin(c * 0.01) * 0.5 + ((c % GRID) / GRID) * 3;
    const h = new Float32Array(N_CELLS);
    for (let j = 40; j < 80; j++) for (let i = 40; i < 80; i++) h[j * GRID + i] = 8;
    const qx = new Float32Array(N_CELLS);
    const qz = new Float32Array(N_CELLS);
    const w = makeFloodWork();
    const v0 = volume(h);
    for (let k = 0; k < 600; k++) routeWater(h, z, manning, qx, qz, 2, w, null);
    const v1 = volume(h);
    expect(Math.abs(v1 - v0) / v0).toBeLessThan(1e-4);
    let min = Infinity;
    for (let c = 0; c < N_CELLS; c++) min = Math.min(min, h[c]);
    expect(min).toBeGreaterThanOrEqual(0);
    expect(allFinite(h)).toBe(true);
    expect(allFinite(qx)).toBe(true);
  });

  it('keeps a lake at rest (well-balanced)', () => {
    const z = new Float32Array(N_CELLS);
    for (let c = 0; c < N_CELLS; c++) z[c] = ((c * 7919) % 13) / 13;
    const h = new Float32Array(N_CELLS);
    for (let c = 0; c < N_CELLS; c++) h[c] = 5 - z[c];
    const qx = new Float32Array(N_CELLS);
    const qz = new Float32Array(N_CELLS);
    const w = makeFloodWork();
    for (let k = 0; k < 100; k++) routeWater(h, z, manning, qx, qz, 2, w, null);
    for (let c = 0; c < N_CELLS; c += 101) expect(h[c] + z[c]).toBeCloseTo(5, 4);
  });

  it('stays stable and non-negative with extreme depths', () => {
    const z = new Float32Array(N_CELLS);
    const h = new Float32Array(N_CELLS);
    h[64 * GRID + 64] = 200; // a 200 m column of water
    const qx = new Float32Array(N_CELLS);
    const qz = new Float32Array(N_CELLS);
    const w = makeFloodWork();
    const v0 = volume(h);
    for (let k = 0; k < 300; k++) routeWater(h, z, manning, qx, qz, 2, w, null);
    expect(allFinite(h)).toBe(true);
    expect(Math.min(...h)).toBeGreaterThanOrEqual(0);
    expect(Math.abs(volume(h) - v0) / v0).toBeLessThan(1e-4);
  });
});

describe('flooding in the city', () => {
  const city = testCity();

  it('pumps keep the polder drier than when they fail', () => {
    const polderDepth = (fail: boolean) => {
      const cmds = [{ id: 1, tick: 1, source: 'scenario' as const, spec: { kind: 'rain' as const, rate: 60, durationMin: 60 } }];
      if (fail) for (const [k, id] of [13, 14, 15].entries()) cmds.push({ id: 2 + k, tick: 1, source: 'scenario', spec: { kind: 'asset', assetId: id, action: 'damage' } } as never);
      const sim = new Simulation(scenario({ commands: cmds }), city);
      for (let k = 0; k < minutesToTicks(50); k++) sim.step();
      let v = 0;
      for (let c = 0; c < N_CELLS; c++) if (city.pumpCatchment[c] >= 0) v += sim.s.water[c];
      return v;
    };
    const ok = polderDepth(false);
    const failed = polderDepth(true);
    expect(failed).toBeGreaterThan(ok * 1.3);
  });

  it('a large storm surge overtops and breaches the seawall, flooding the polder', () => {
    const sim = new Simulation(scenario({ commands: [{ id: 1, tick: 1, source: 'scenario', spec: { kind: 'surge', height: 5, durationMin: 120 } }] }), city);
    for (let k = 0; k < minutesToTicks(60); k++) sim.step();
    const types = new Set(sim.events.map((e) => e.type));
    expect(types.has('levee_overtop')).toBe(true);
    expect(types.has('levee_breach')).toBe(true);
    expect(types.has('flood_zone')).toBe(true);
    const breach = sim.events.find((e) => e.type === 'levee_breach')!;
    expect(sim.events[breach.causes[0]].type).toBe('levee_overtop');
    expect(sim.metrics().floodedAreaKm2).toBeGreaterThan(0.2);
  });

  it('the river carries its base flow without flooding the banks', () => {
    const sim = new Simulation(scenario(), city);
    for (let k = 0; k < minutesToTicks(20); k++) sim.step();
    expect(sim.metrics().floodedAreaKm2).toBeLessThan(0.01);
    let riverWet = 0;
    for (let c = 0; c < N_CELLS; c++) if (city.zone[c] === 1 && sim.s.water[c] > 0.1) riverWet++;
    expect(riverWet).toBeGreaterThan(100);
  });
});
