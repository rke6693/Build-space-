import { describe, expect, it } from 'vitest';
import { SimController, frameTransferables, runHeadless } from '../src/sim/controller';
import { causalChain } from '../src/sim/events';
import { builtinScenarios, minutesToTicks } from '../src/sim/scenario';
import { testCity } from './helpers';

/**
 * Integration test of the primary user workflow at the controller level (the same code the
 * Web Worker runs): load the baseline city, trigger an earthquake, watch consequences,
 * pause/replay, branch, and compare against an alternative scenario.
 */
describe('primary workflow', () => {
  const city = testCity();
  const baseline = { ...builtinScenarios()[0], agents: 1200 };

  it('trigger → cascade → inspect → replay → compare', () => {
    const ctl = new SimController(baseline, city);
    ctl.advance(minutesToTicks(2));
    expect(ctl.recorded.length).toBe(0); // calm city

    // 1) trigger an earthquake from the toolbox
    const cmd = ctl.issue({ kind: 'earthquake', x: 400, z: 2800, magnitude: 7.0, depthKm: 10, aftershocks: true });
    ctl.advance(minutesToTicks(25));
    const types = new Set(ctl.recorded.map((e) => e.type));
    expect(types.has('earthquake')).toBe(true);
    expect(types.has('power_loss') || types.has('substation_damage')).toBe(true);
    const m = ctl.history[ctl.history.length - 1];
    expect(m.bModerate + m.bExtensive + m.bCollapsed).toBeGreaterThan(50);

    // 2) inspect a cascading failure: its chain reaches back to the quake
    const cascade = ctl.recorded.find((e) => e.type === 'power_loss' || e.type === 'backup_start');
    expect(cascade).toBeDefined();
    const chain = causalChain(ctl.recorded, cascade!.id);
    expect(chain.some((l) => l.event.type === 'earthquake')).toBe(true);

    // 3) frames carry the render state
    const f = ctl.buildFrame({ playing: false, speed: 1 });
    expect(f.bState.length).toBe(city.buildings.count);
    expect(f.agentsXZ.length).toBe(ctl.sim.s.agents.count * 2);
    expect(frameTransferables(f).length).toBeGreaterThan(10);

    // 4) pause and replay the event from just before the quake
    const end = ctl.tick;
    const endChecksum = ctl.sim.checksum();
    ctl.seek(cmd.tick - 5);
    expect(ctl.replaying).toBe(true);
    ctl.seek(end);
    expect(ctl.sim.checksum()).toBe(endChecksum);
    expect(ctl.verification.mismatches).toBe(0);

    // 5) compare with a second scenario from the same initial conditions
    const a = ctl.currentScenario();
    const b = { ...a, resilience: { ...a.resilience, substationRetrofit: true, buildingRetrofit: true } };
    const ra = runHeadless(a, end, 30, undefined, city);
    const rb = runHeadless(b, end, 30, undefined, city);
    expect(ra.checksum).toBe(endChecksum);
    expect(rb.final.bCollapsed).toBeLessThanOrEqual(ra.final.bCollapsed);
    expect(rb.final.lossTotal).toBeLessThan(ra.final.lossTotal);
  });
});
