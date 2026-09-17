import { describe, expect, it } from 'vitest';
import { parseWhen } from '@/lib/hermes/chrono';
import { classify, describe as summarize } from '@/lib/hermes/intent';

// A fixed Wednesday, 2026-09-16 10:00 UTC. All cases below run at UTC offset 0
// unless they are specifically exercising the offset handling.
const NOW = new Date('2026-09-16T10:00:00.000Z');

function iso(d?: Date): string | undefined {
  return d?.toISOString();
}

describe('parseWhen', () => {
  it('handles relative durations', () => {
    expect(iso(parseWhen('in 20 minutes', NOW)?.at)).toBe('2026-09-16T10:20:00.000Z');
    expect(iso(parseWhen('in an hour', NOW)?.at)).toBe('2026-09-16T11:00:00.000Z');
    expect(iso(parseWhen('in two days', NOW)?.at)).toBe('2026-09-18T10:00:00.000Z');
    expect(iso(parseWhen('in an hour and a half', NOW)?.at)).toBe('2026-09-16T11:30:00.000Z');
  });

  it('handles clock times with meridiem', () => {
    expect(iso(parseWhen('at 4pm', NOW)?.at)).toBe('2026-09-16T16:00:00.000Z');
    expect(iso(parseWhen('at 7:30am', NOW)?.at)).toBe('2026-09-17T07:30:00.000Z'); // already past today
    expect(iso(parseWhen('tomorrow at 4', NOW)?.at)).toBe('2026-09-17T04:00:00.000Z');
    expect(iso(parseWhen('tomorrow at 4pm', NOW)?.at)).toBe('2026-09-17T16:00:00.000Z');
  });

  it('rolls a bare clock time forward when it has already passed', () => {
    // 9:00 today is behind us at 10:00, so "at 9" means tonight.
    expect(iso(parseWhen('at 9', NOW)?.at)).toBe('2026-09-16T21:00:00.000Z');
  });

  it('handles day parts', () => {
    expect(iso(parseWhen('tonight', NOW)?.at)).toBe('2026-09-16T20:00:00.000Z');
    expect(iso(parseWhen('tomorrow morning', NOW)?.at)).toBe('2026-09-17T09:00:00.000Z');
    expect(iso(parseWhen('this afternoon', NOW)?.at)).toBe('2026-09-16T14:00:00.000Z');
  });

  it('handles weekdays, always resolving forward', () => {
    // NOW is a Wednesday.
    expect(iso(parseWhen('friday', NOW)?.at)).toBe('2026-09-18T09:00:00.000Z');
    expect(iso(parseWhen('on wednesday', NOW)?.at)).toBe('2026-09-23T09:00:00.000Z'); // not today
    expect(iso(parseWhen('next tuesday', NOW)?.at)).toBe('2026-09-29T09:00:00.000Z');
    expect(iso(parseWhen('friday at 6pm', NOW)?.at)).toBe('2026-09-18T18:00:00.000Z');
  });

  it('resolves wall-clock times in the speaker’s timezone', () => {
    // 10:00 UTC is 03:00 in PDT (-420). "at 4pm" means 16:00 local = 23:00 UTC.
    expect(iso(parseWhen('at 4pm', NOW, -420)?.at)).toBe('2026-09-16T23:00:00.000Z');
    // Tokyo (+540) is already 19:00, so "at 4pm" rolls to tomorrow: 16:00 JST = 07:00 UTC.
    expect(iso(parseWhen('at 4pm', NOW, 540)?.at)).toBe('2026-09-17T07:00:00.000Z');
  });

  it('returns null when no time was spoken', () => {
    expect(parseWhen('call mom', NOW)).toBeNull();
    expect(parseWhen('buy milk and eggs', NOW)).toBeNull();
  });
});

describe('classify', () => {
  it('extracts a reminder with a time and strips the time from the title', () => {
    const c = classify('remind me to call mom tomorrow at 4pm', NOW);
    expect(c.intent).toBe('REMINDER');
    expect(c.title).toBe('Call mom');
    expect(iso(c.dueAt)).toBe('2026-09-17T16:00:00.000Z');
    expect(c.confidence).toBeGreaterThan(0.9);
  });

  it('handles a reminder with no time', () => {
    const c = classify('remind me to take out the trash', NOW);
    expect(c.intent).toBe('REMINDER');
    expect(c.title).toBe('Take out the trash');
    expect(c.dueAt).toBeUndefined();
  });

  it('routes list additions and recovers the list name', () => {
    const c = classify('add milk to my grocery list', NOW);
    expect(c.intent).toBe('LIST_ADD');
    expect(c.title).toBe('Milk');
    expect(c.listName).toBe('grocery');

    const c2 = classify('put batteries on the hardware list', NOW);
    expect(c2.intent).toBe('LIST_ADD');
    expect(c2.listName).toBe('hardware');

    const c3 = classify('add sunscreen to my list', NOW);
    expect(c3.intent).toBe('LIST_ADD');
    expect(c3.listName).toBeUndefined();
  });

  it('treats a dated task as a reminder', () => {
    const c = classify('i need to submit the invoice on friday', NOW);
    expect(c.intent).toBe('REMINDER');
    expect(iso(c.dueAt)).toBe('2026-09-18T09:00:00.000Z');
  });

  it('keeps an undated task a task', () => {
    const c = classify('i need to refactor the auth module', NOW);
    expect(c.intent).toBe('TASK');
    expect(c.title).toBe('Refactor the auth module');
  });

  it('recognises notes, messages, questions and timers', () => {
    expect(classify('note to self the wifi password is on the router', NOW).intent).toBe('NOTE');
    expect(classify('tell Sarah I am running ten minutes late', NOW).intent).toBe('MESSAGE');
    expect(classify('what is on my calendar tomorrow', NOW).intent).toBe('QUESTION');

    const timer = classify('set a timer for 10 minutes', NOW);
    expect(timer.intent).toBe('TIMER');
    expect(iso(timer.dueAt)).toBe('2026-09-16T10:10:00.000Z');
  });

  it('strips dictation filler from the front', () => {
    const c = classify('um, hey Hermes, remind me to water the plants tonight', NOW);
    expect(c.intent).toBe('REMINDER');
    expect(c.title).toBe('Water the plants');
    expect(iso(c.dueAt)).toBe('2026-09-16T20:00:00.000Z');
  });

  it('falls back to a note rather than losing an unclassifiable capture', () => {
    const c = classify('the blue one by the door', NOW);
    expect(c.intent).toBe('NOTE');
    expect(c.title).toBe('The blue one by the door');
  });

  it('never throws on empty or junk input', () => {
    expect(classify('', NOW).intent).toBe('UNKNOWN');
    expect(classify('   ', NOW).intent).toBe('UNKNOWN');
    expect(() => classify('?!?!', NOW)).not.toThrow();
  });

  it('summarises for the watch confirmation screen', () => {
    const c = classify('remind me to call mom tomorrow at 4pm', NOW);
    expect(summarize(c, 'UTC')).toContain('Reminder: Call mom');
    expect(summarize(classify('add milk to my grocery list', NOW))).toBe('grocery list: + Milk');
  });
});
