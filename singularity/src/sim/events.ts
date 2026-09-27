import { MAX_EVENTS } from './config';
import type { EventCategory, EventType, SimEvent, SimState } from './types';

export interface EventSpec {
  type: EventType;
  category: EventCategory;
  severity: 0 | 1 | 2 | 3;
  title: string;
  detail: string;
  x: number;
  z: number;
  causes?: number[];
  subject?: SimEvent['subject'];
  radius?: number;
}

/**
 * Append-only, timestamped event store forming a causal DAG: every event may cite
 * earlier events as causes. Event ids equal their index in `events`, which keeps
 * lookups O(1) and makes truncation on replay/branching trivial.
 */
export class EventLog {
  events: SimEvent[] = [];

  emit(s: SimState, spec: EventSpec): number {
    const n = this.events.length;
    // Bounded memory: past the soft cap only major/critical events are kept, and a hard cap stops everything.
    if (n >= MAX_EVENTS * 1.25 || (n >= MAX_EVENTS && spec.severity < 2)) return -1;
    const id = s.nextEventId;
    if (id !== n) {
      // Should never happen; keeps ids == indices even if state and log diverged.
      this.events.length = Math.min(this.events.length, id);
    }
    const causes = (spec.causes ?? []).filter((c, k, arr) => c >= 0 && c < id && arr.indexOf(c) === k).slice(0, 8);
    const ev: SimEvent = {
      id,
      tick: s.tick,
      type: spec.type,
      category: spec.category,
      severity: spec.severity,
      title: spec.title,
      detail: spec.detail,
      x: Number.isFinite(spec.x) ? spec.x : 0,
      z: Number.isFinite(spec.z) ? spec.z : 0,
      causes,
    };
    if (spec.subject) ev.subject = spec.subject;
    if (spec.radius) ev.radius = spec.radius;
    this.events.push(ev);
    s.nextEventId = id + 1;
    return id;
  }

  truncate(count: number) {
    if (this.events.length > count) this.events.length = count;
  }
}

export interface ChainLink {
  event: SimEvent;
  depth: number;
}

/**
 * Walks the causal DAG upwards from `id` (depth-first, most recent cause first).
 * Causes always have smaller ids than their effects, so the walk terminates.
 */
export function causalChain(events: readonly SimEvent[], id: number, maxNodes = 40): ChainLink[] {
  const out: ChainLink[] = [];
  const seen = new Set<number>();
  const visit = (eid: number, depth: number) => {
    if (out.length >= maxNodes || seen.has(eid)) return;
    const ev = events[eid];
    if (!ev || ev.id !== eid) return;
    seen.add(eid);
    out.push({ event: ev, depth });
    const causes = [...ev.causes].sort((a, b) => b - a);
    for (const c of causes) if (c < eid) visit(c, depth + 1);
  };
  visit(id, 0);
  return out;
}

export function rootCauses(events: readonly SimEvent[], id: number): SimEvent[] {
  const chain = causalChain(events, id, 200);
  return chain.filter((l) => l.event.causes.length === 0).map((l) => l.event);
}

/** Longest causal path length (number of hops) behind an event. */
export function cascadeDepth(events: readonly SimEvent[], id: number): number {
  const memo = new Map<number, number>();
  const depth = (eid: number, guard: number): number => {
    if (guard > 64) return 0;
    const m = memo.get(eid);
    if (m !== undefined) return m;
    const ev = events[eid];
    if (!ev) return 0;
    let d = 0;
    for (const c of ev.causes) if (c < eid) d = Math.max(d, 1 + depth(c, guard + 1));
    memo.set(eid, d);
    return d;
  };
  return depth(id, 0);
}

/** Human-readable causal explanation, newest effect first. */
export function explainEvent(events: readonly SimEvent[], id: number, secondsPerTick: number): string[] {
  return causalChain(events, id, 12).map((l) => {
    const t = l.event.tick * secondsPerTick;
    const hh = Math.floor(t / 3600);
    const mm = Math.floor((t % 3600) / 60);
    const ss = Math.floor(t % 60);
    const stamp = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
    return `${'  '.repeat(l.depth)}${l.depth ? '← ' : ''}[T+${stamp}] ${l.event.title}${l.event.detail ? ' — ' + l.event.detail : ''}`;
  });
}

/** Events whose effects trace back to `id` (downstream consequences). */
export function consequences(events: readonly SimEvent[], id: number, max = 200): SimEvent[] {
  const affected = new Set<number>([id]);
  const out: SimEvent[] = [];
  for (let k = id + 1; k < events.length && out.length < max; k++) {
    const ev = events[k];
    if (ev.causes.some((c) => affected.has(c))) {
      affected.add(ev.id);
      out.push(ev);
    }
  }
  return out;
}
