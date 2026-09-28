import { describe, expect, it } from 'vitest';
import { Simulation } from '../src/sim/engine';
import { minutesToTicks } from '../src/sim/scenario';
import { AgentState, type Command } from '../src/sim/types';
import { scenario, testCity } from './helpers';

describe('population behaviour', () => {
  const city = testCity();

  it('evacuees who cannot reach any open shelter take refuge in place instead of wandering', () => {
    const shelters = city.assets.filter((a) => a.kind === 'shelter');
    const commands: Command[] = shelters.map((sh, k) => ({ id: k + 1, tick: 1, source: 'scenario', spec: { kind: 'asset', assetId: sh.id, action: 'damage' } }));
    commands.push({ id: 99, tick: 3, source: 'scenario', spec: { kind: 'evacuate', x: 0, z: 0, radius: 1500 } });
    const sim = new Simulation(scenario({ commands }), city);
    for (let k = 0; k < minutesToTicks(4); k++) sim.step();
    const early = sim.metrics();
    expect(early.evacuating).toBeGreaterThan(0);
    expect(early.stranded).toBeGreaterThan(0);

    for (let k = 0; k < minutesToTicks(30); k++) sim.step();
    const m = sim.metrics();
    expect(m.shelterInPlace).toBeGreaterThan(0);
    expect(m.evacuated).toBe(0); // no public shelter was open
    expect(m.sheltered).toBe(m.shelterInPlace);
    expect(m.stranded).toBeLessThan(early.stranded);
    // refuge is taken inside an intact building
    const A = sim.s.agents;
    for (let a = 0; a < A.count; a++) {
      if (A.state[a] !== AgentState.Sheltered) continue;
      expect(A.target[a]).toBe(-1);
      expect(A.at[a]).toBeGreaterThanOrEqual(0);
      expect(sim.s.bDS[A.at[a]]).toBeLessThan(3);
    }
  });

  it('evacuees with an open shelter walk there and are counted as evacuated', () => {
    const sim = new Simulation(scenario({ commands: [{ id: 1, tick: 2, source: 'scenario', spec: { kind: 'evacuate', x: 0, z: 0, radius: 1200 } }] }), city);
    for (let k = 0; k < minutesToTicks(60); k++) sim.step();
    const m = sim.metrics();
    expect(m.evacuated).toBeGreaterThan(0);
    expect(m.shelterInPlace).toBe(0);
    expect(m.sheltered).toBe(m.evacuated);
  });
});
