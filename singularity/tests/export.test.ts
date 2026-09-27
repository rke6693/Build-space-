import { describe, expect, it } from 'vitest';
import { SimController } from '../src/sim/controller';
import { buildSummary, eventsToCSV, metricsToCSV, parseCSV } from '../src/sim/export';
import { METRIC_KEYS } from '../src/sim/metrics';
import { scenario, testCity } from './helpers';

describe('exports', () => {
  const ctl = new SimController(scenario({ commands: [{ id: 1, tick: 3, source: 'scenario', spec: { kind: 'fire', x: 100, z: -700, radius: 1 } }] }), testCity());
  ctl.advance(120);

  it('metrics CSV has a header and one row per sample', () => {
    const rows = parseCSV(metricsToCSV(ctl.history));
    expect(rows[0]).toEqual(METRIC_KEYS);
    expect(rows.length).toBe(ctl.history.length + 1);
    for (const r of rows.slice(1)) expect(r.length).toBe(METRIC_KEYS.length);
  });

  it('events CSV escapes commas and quotes', () => {
    const ev = [{ ...ctl.recorded[0], title: 'A "quoted", title', detail: 'line1\nline2' }];
    const rows = parseCSV(eventsToCSV(ev));
    expect(rows[1][6]).toBe('A "quoted", title');
    expect(rows[1][7]).toBe('line1\nline2');
  });

  it('JSON summary carries scenario, checksum, disclaimer and peaks', () => {
    const s = buildSummary(ctl.currentScenario(), ctl.history, ctl.recorded, ctl.sim.checksum(), ctl.verification, '2026-01-01T00:00:00Z');
    const json = JSON.parse(JSON.stringify(s));
    expect(json.checksum).toMatch(/^[0-9a-f]{8}$/);
    expect(json.disclaimer).toMatch(/illustrative/);
    expect(json.scenario.commands.length).toBe(1);
    expect(json.peaks.activeFires).toBeGreaterThan(0);
    expect(json.history.length).toBe(ctl.history.length);
  });
});
