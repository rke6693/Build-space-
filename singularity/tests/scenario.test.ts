import { describe, expect, it } from 'vitest';
import { baseScenario, builtinScenarios, describeCommand, parseScenario, serializeScenario, validateScenario } from '../src/sim/scenario';

describe('scenario serialisation', () => {
  it('round-trips through JSON', () => {
    for (const s of builtinScenarios()) {
      const text = serializeScenario(s);
      const { scenario, errors } = parseScenario(text);
      expect(errors).toEqual([]);
      expect(scenario).not.toBeNull();
      const { builtin: _b, ...rest } = s;
      void _b;
      expect(scenario).toEqual({ ...rest, commands: s.commands.map((c, i) => ({ ...c, id: i + 1 })) });
    }
  });

  it('rejects malformed input with helpful errors', () => {
    expect(parseScenario('{not json').scenario).toBeNull();
    expect(validateScenario(42).scenario).toBeNull();
    const r = validateScenario({ commands: [{ tick: 3, spec: { kind: 'volcano' } }, { tick: 'x', spec: { kind: 'rain', rate: 20, durationMin: 10 } }] });
    expect(r.scenario!.commands.length).toBe(1);
    expect(r.errors.some((e) => e.includes('unknown command kind'))).toBe(true);
    expect(r.errors.some((e) => e.includes('tick'))).toBe(true);
  });

  it('clamps out-of-range values instead of propagating them', () => {
    const r = validateScenario({ agents: 1e9, env: { rainfall: 1e6, windSpeed: -3, temperature: NaN }, commands: [{ tick: 5, spec: { kind: 'earthquake', x: 0, z: 0, magnitude: 15, depthKm: 0, aftershocks: true } }] });
    const s = r.scenario!;
    expect(s.agents).toBeLessThanOrEqual(5000);
    expect(s.env.rainfall).toBe(200);
    expect(s.env.windSpeed).toBe(0);
    expect(Number.isFinite(s.env.temperature)).toBe(true);
    const q = s.commands[0].spec;
    expect(q.kind === 'earthquake' && q.magnitude).toBe(9);
    expect(r.errors.length).toBeGreaterThan(0);
  });

  it('sorts commands and renumbers ids', () => {
    const r = validateScenario({ ...baseScenario(), commands: [{ tick: 50, spec: { kind: 'rain', rate: 10, durationMin: 5 } }, { tick: 5, spec: { kind: 'surge', height: 1, durationMin: 30 } }] });
    expect(r.scenario!.commands.map((c) => c.tick)).toEqual([5, 50]);
    expect(r.scenario!.commands.map((c) => c.id)).toEqual([1, 2]);
  });

  it('describes commands for the UI', () => {
    expect(describeCommand({ kind: 'earthquake', x: 0, z: 0, magnitude: 7.1, depthKm: 11, aftershocks: true })).toContain('M7.1');
    expect(describeCommand({ kind: 'storm', category: 3, dirDeg: 180, durationMin: 60, lightning: false })).toContain('Category 3');
  });
});
