import { describe, expect, it } from 'vitest';
import { GRID, N_CELLS, cellX, cellZ } from '../src/sim/config';
import { Simulation } from '../src/sim/engine';
import { ignitionThreshold } from '../src/sim/systems/fire';
import { minutesToTicks } from '../src/sim/scenario';
import { allFinite, scenario, testCity } from './helpers';

describe('fire model', () => {
  const city = testCity();
  // pick a dense residential cell away from the coast
  let start = 0;
  for (let c = 0; c < N_CELLS; c++) {
    const x = cellX(c % GRID);
    const z = cellZ((c / GRID) | 0);
    if (Math.abs(x - 900) < 20 && Math.abs(z + 1000) < 20) start = c;
  }

  const burnSpread = (windDir: number, extra: Partial<ReturnType<typeof scenario>['env']> = {}) => {
    const sc = scenario({
      env: { rainfall: 0, windSpeed: 14, windDir, temperature: 34, seaLevel: 0, soilSaturation: 0.05, ...extra },
      resilience: { ...scenario().resilience, crewsPerStation: 0 },
      commands: [{ id: 1, tick: 1, source: 'scenario', spec: { kind: 'fire', x: cellX(start % GRID), z: cellZ((start / GRID) | 0), radius: 1 } }],
    });
    const sim = new Simulation(sc, city);
    for (let k = 0; k < minutesToTicks(35); k++) sim.step();
    // centroid displacement of burnt/burning area relative to start (x axis)
    let sx = 0;
    let n = 0;
    for (let c = 0; c < N_CELLS; c++) {
      if (sim.s.burn[c] > 0 || sim.s.burned[c]) {
        sx += cellX(c % GRID) - cellX(start % GRID);
        n++;
      }
    }
    return { sim, cells: n, dx: n ? sx / n : 0 };
  };

  it('spreads downwind', () => {
    // wind FROM the west (270) blows towards +x
    const east = burnSpread(270);
    const west = burnSpread(90);
    expect(east.cells).toBeGreaterThan(3);
    expect(east.dx).toBeGreaterThan(20);
    expect(west.dx).toBeLessThan(-20);
    expect(allFinite(east.sim.s.heat)).toBe(true);
    // fuel only ever decreases
    for (let c = 0; c < N_CELLS; c++) expect(east.sim.s.fuel[c]).toBeLessThanOrEqual(east.sim.d.fuelLoad[c] + 1e-6);
  });

  it('is suppressed by wet conditions', () => {
    const dry = burnSpread(270);
    const wet = burnSpread(270, { rainfall: 40, soilSaturation: 0.9, temperature: 12 });
    expect(wet.cells).toBeLessThan(dry.cells);
  });

  it('ignition threshold rises with moisture and falls with heat', () => {
    expect(ignitionThreshold(0.8, 20)).toBeGreaterThan(ignitionThreshold(0.1, 20));
    expect(ignitionThreshold(0.3, 40)).toBeLessThan(ignitionThreshold(0.3, 5));
  });

  it('fire crews are dispatched over the road network', () => {
    const sc = scenario({
      env: { rainfall: 0, windSpeed: 6, windDir: 200, temperature: 25, seaLevel: 0, soilSaturation: 0.3 },
      commands: [{ id: 1, tick: 1, source: 'scenario', spec: { kind: 'fire', x: cellX(start % GRID), z: cellZ((start / GRID) | 0), radius: 0 } }],
    });
    const sim = new Simulation(sc, city);
    for (let k = 0; k < minutesToTicks(20); k++) sim.step();
    expect(sim.events.some((e) => e.type === 'crew_dispatched')).toBe(true);
    expect(Array.from(sim.s.crews.state).some((st) => st !== 0)).toBe(true);
  });
});
