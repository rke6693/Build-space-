import { describe, expect, it } from 'vitest';
import { SimController, runHeadless } from '../src/sim/controller';
import { Simulation, packState, unpackState } from '../src/sim/engine';
import { SHOWCASE_QUAKE, builtinScenarios, minutesToTicks } from '../src/sim/scenario';
import { scenario, testCity } from './helpers';

describe('deterministic simulation', () => {
  const city = testCity();
  const quakeScenario = () =>
    scenario({ env: { ...scenario().env, rainfall: 20, windSpeed: 14 }, commands: [{ id: 1, tick: 20, source: 'scenario', spec: { ...SHOWCASE_QUAKE } }, { id: 2, tick: 60, source: 'scenario', spec: { kind: 'storm', category: 1, dirDeg: 200, durationMin: 60, lightning: true } }] });

  it('same scenario ⇒ bit-identical state', () => {
    const a = new Simulation(quakeScenario(), city);
    const b = new Simulation(quakeScenario(), city);
    for (let k = 0; k < 500; k++) {
      a.step();
      b.step();
    }
    expect(a.checksum()).toBe(b.checksum());
    expect(a.events.length).toBe(b.events.length);
    expect(a.events.map((e) => e.title)).toEqual(b.events.map((e) => e.title));
  });

  it('different commands ⇒ different state', () => {
    const a = new Simulation(quakeScenario(), city);
    const sc = quakeScenario();
    sc.commands[0].spec = { ...(SHOWCASE_QUAKE as Extract<typeof SHOWCASE_QUAKE, { kind: 'earthquake' }>), magnitude: 6.0 };
    const b = new Simulation(sc, city);
    for (let k = 0; k < 200; k++) {
      a.step();
      b.step();
    }
    expect(a.checksum()).not.toBe(b.checksum());
  });

  it('snapshot → restore reproduces the future exactly', () => {
    const sim = new Simulation(quakeScenario(), city);
    for (let k = 0; k < 150; k++) sim.step();
    const snap = sim.snapshot();
    for (let k = 0; k < 300; k++) sim.step();
    const expected = sim.checksum();
    const expectedEvents = sim.events.length;
    sim.restore(snap);
    expect(sim.tick).toBe(150);
    for (let k = 0; k < 300; k++) sim.step();
    expect(sim.checksum()).toBe(expected);
    expect(sim.events.length).toBe(expectedEvents);
  });

  it('packed snapshots are compact and lossless', () => {
    const sim = new Simulation(quakeScenario(), city);
    for (let k = 0; k < 100; k++) sim.step();
    const packed = packState(sim.s);
    const round = unpackState(packed);
    const before = sim.checksum();
    sim.s = round as never;
    expect(sim.checksum()).toBe(before);
  });

  it('controller seek backwards/forwards is a verified deterministic replay', () => {
    const ctl = new SimController(quakeScenario(), city);
    ctl.advance(400);
    const at400 = ctl.sim.checksum();
    const frontierEvents = ctl.recorded.length;
    ctl.seek(130);
    expect(ctl.tick).toBe(130);
    expect(ctl.replaying).toBe(true);
    ctl.seek(400);
    expect(ctl.sim.checksum()).toBe(at400);
    expect(ctl.verification.checked).toBeGreaterThan(0);
    expect(ctl.verification.mismatches).toBe(0);
    expect(ctl.recorded.length).toBe(frontierEvents);
  });

  it('issuing a command in the past creates a new branch', () => {
    const ctl = new SimController(quakeScenario(), city);
    ctl.advance(300);
    const frontierBefore = ctl.frontier;
    ctl.seek(100);
    const cmd = ctl.issue({ kind: 'fire', x: 200, z: -800, radius: 1 });
    expect(cmd.tick).toBe(100);
    expect(ctl.frontier).toBe(100);
    expect(frontierBefore).toBe(300);
    expect(ctl.keyframes.every((k) => k.tick <= 100)).toBe(true);
    expect(ctl.history.every((m) => m.tick <= 100)).toBe(true);
    expect(ctl.recorded.every((e) => e.tick < 100)).toBe(true);
    ctl.advance(50);
    expect(ctl.recorded.some((e) => e.type === 'fire_ignition' && e.tick === 100)).toBe(true);
    // replaying the branch is still exact
    const cs = ctl.sim.checksum();
    ctl.seek(20);
    ctl.seek(150);
    expect(ctl.sim.checksum()).toBe(cs);
    expect(ctl.verification.mismatches).toBe(0);
  });

  it('headless comparison runs share initial conditions', () => {
    const [base] = builtinScenarios();
    const sc = { ...base, agents: 600 };
    const a = runHeadless(sc, 30, 15, undefined, city);
    const b = runHeadless(sc, 30, 15, undefined, city);
    expect(a.checksum).toBe(b.checksum);
    expect(a.samples.length).toBe(3);
  });

  it('bounds memory: keyframes are thinned', () => {
    const ctl = new SimController(scenario({ durationMin: 360, agents: 300 }), city);
    ctl.keyInterval = 2; // force frequent keyframes
    ctl.advance(minutesToTicks(12));
    expect(ctl.keyframes.length).toBeLessThanOrEqual(141);
    expect(ctl.keyInterval).toBeGreaterThan(2);
  });
});
