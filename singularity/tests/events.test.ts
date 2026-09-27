import { describe, expect, it } from 'vitest';
import { EventLog, cascadeDepth, causalChain, consequences, explainEvent, rootCauses } from '../src/sim/events';
import type { SimState } from '../src/sim/types';

function fakeState(): SimState {
  return { tick: 0, nextEventId: 0 } as unknown as SimState;
}

describe('event graph', () => {
  const s = fakeState();
  const log = new EventLog();
  const base = { category: 'power' as const, severity: 2 as const, detail: '', x: 0, z: 0 };
  const quake = log.emit(s, { ...base, type: 'earthquake', title: 'Quake' });
  s.tick = 3;
  const sub = log.emit(s, { ...base, type: 'substation_damage', title: 'Sub', causes: [quake] });
  const loss = log.emit(s, { ...base, type: 'power_loss', title: 'Loss', causes: [sub] });
  s.tick = 10;
  const backup = log.emit(s, { ...base, type: 'backup_start', title: 'Backup', causes: [loss] });
  const exhausted = log.emit(s, { ...base, type: 'backup_exhausted', title: 'Exhausted', causes: [backup, loss] });
  const pump = log.emit(s, { ...base, type: 'pump_failure', title: 'Pump', causes: [exhausted, 999, -1] });

  it('assigns sequential ids equal to indices and timestamps', () => {
    log.events.forEach((e, i) => expect(e.id).toBe(i));
    expect(log.events[pump].tick).toBe(10);
  });
  it('drops invalid / future causes (no cycles possible)', () => {
    expect(log.events[pump].causes).toEqual([exhausted]);
    for (const e of log.events) for (const c of e.causes) expect(c).toBeLessThan(e.id);
  });
  it('walks causal chains to the root', () => {
    const chain = causalChain(log.events, pump);
    expect(chain[0].event.id).toBe(pump);
    expect(chain.map((l) => l.event.type)).toEqual(['pump_failure', 'backup_exhausted', 'backup_start', 'power_loss', 'substation_damage', 'earthquake']);
    expect(rootCauses(log.events, pump).map((e) => e.id)).toEqual([quake]);
    expect(cascadeDepth(log.events, pump)).toBe(5);
    expect(consequences(log.events, sub).map((e) => e.id)).toEqual([loss, backup, exhausted, pump]);
    const text = explainEvent(log.events, pump, 2);
    expect(text[0]).toContain('Pump');
    expect(text.some((t) => t.includes('Quake'))).toBe(true);
  });
  it('truncates for replay branches', () => {
    const copy = new EventLog();
    copy.events = log.events.slice();
    copy.truncate(3);
    expect(copy.events.length).toBe(3);
  });
});
