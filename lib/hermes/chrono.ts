// ---------------------------------------------------------------------------
// A small, dependency-free natural-language time parser sized for the phrases
// people actually speak into a watch: "in 20 minutes", "tomorrow at 4",
// "tonight", "next Tuesday", "friday morning", "at 7:30pm".
//
// Why not a library: this runs on the hot path of a capture, must never throw,
// and the watch gives us the device's UTC offset so we can resolve wall-clock
// times without pulling in a timezone database.
//
// Arithmetic happens in "local pseudo-UTC": shift the instant by the device's
// offset, do all math with getUTC*, then shift back. Exact for fixed offsets;
// a DST transition inside the horizon can land the result an hour off, which is
// why the LLM refinement (when configured) gets the final say.
// ---------------------------------------------------------------------------

export type ParsedTime = {
  at: Date;
  /** The substring that carried the time, so callers can strip it from the title. */
  matched: string;
  /** Rough confidence: explicit clock times score higher than bare day names. */
  confidence: number;
};

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const WEEKDAYS: Record<string, number> = {
  sunday: 0, sun: 0,
  monday: 1, mon: 1,
  tuesday: 2, tue: 2, tues: 2,
  wednesday: 3, wed: 3,
  thursday: 4, thu: 4, thur: 4, thurs: 4,
  friday: 5, fri: 5,
  saturday: 6, sat: 6,
};

const UNIT_MS: Record<string, number> = {
  second: 1000, seconds: 1000, sec: 1000, secs: 1000,
  minute: MINUTE, minutes: MINUTE, min: MINUTE, mins: MINUTE,
  hour: HOUR, hours: HOUR, hr: HOUR, hrs: HOUR,
  day: DAY, days: DAY,
  week: 7 * DAY, weeks: 7 * DAY,
};

const NUMBER_WORDS: Record<string, number> = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7,
  eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, fifteen: 15, twenty: 20,
  thirty: 30, forty: 40, sixty: 60, ninety: 90,
};

// Named parts of the day, as the hour they resolve to.
const DAYPARTS: Record<string, number> = {
  morning: 9,
  noon: 12,
  midday: 12,
  afternoon: 14,
  evening: 18,
  tonight: 20,
  night: 21,
  midnight: 0,
};

function toLocal(utcMs: number, offsetMinutes: number): Date {
  return new Date(utcMs + offsetMinutes * MINUTE);
}

function fromLocal(local: Date, offsetMinutes: number): Date {
  return new Date(local.getTime() - offsetMinutes * MINUTE);
}

function setLocalTime(local: Date, hour: number, minute: number): Date {
  const d = new Date(local.getTime());
  d.setUTCHours(hour, minute, 0, 0);
  return d;
}

/**
 * Extracts a due time from `text`.
 *
 * @param offsetMinutes minutes to ADD to UTC to get the device's local time
 *                      (PDT = -420). Defaults to UTC.
 */
export function parseWhen(text: string, now = new Date(), offsetMinutes = 0): ParsedTime | null {
  const lower = text.toLowerCase();
  const localNow = toLocal(now.getTime(), offsetMinutes);

  // --- "in half an hour" -------------------------------------------------
  const halfUnit = lower.match(/\bin\s+half\s+an?\s+(hour|minute|day)\b/);
  if (halfUnit) {
    return {
      at: new Date(now.getTime() + UNIT_MS[halfUnit[1]!]! / 2),
      matched: halfUnit[0],
      confidence: 0.95,
    };
  }

  // --- "in 20 minutes" / "in an hour and a half" -------------------------
  // The "and a half" rider can sit on either side of the unit in speech
  // ("an hour and a half", "an and a half hour" never happens, but
  // "one and a half hours" does), so both positions are optional here.
  const rel = lower.match(
    /\bin\s+(a|an|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty|thirty|forty|sixty|ninety|\d+)\s*(?:and\s+a\s+half\s+)?(second|seconds|sec|secs|minute|minutes|min|mins|hour|hours|hr|hrs|day|days|week|weeks)(?:\s+and\s+a\s+half)?\b/,
  );
  if (rel) {
    const qty = NUMBER_WORDS[rel[1]!] ?? Number.parseInt(rel[1]!, 10);
    const unit = UNIT_MS[rel[2]!]!;
    const half = /and\s+a\s+half/.test(rel[0]) ? unit / 2 : 0;
    if (Number.isFinite(qty)) {
      return { at: new Date(now.getTime() + qty * unit + half), matched: rel[0], confidence: 0.95 };
    }
  }

  // --- explicit clock time, optionally anchored to a day ------------------
  const clock = lower.match(/\b(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.|o'clock)?\b/);
  const dayAnchor = findDayAnchor(lower, localNow);

  if (clock && (clock[3] || /\bat\s/.test(clock[0]) || dayAnchor)) {
    let hour = Number.parseInt(clock[1]!, 10);
    const minute = clock[2] ? Number.parseInt(clock[2], 10) : 0;
    const meridiem = clock[3]?.replace(/[.\s]/g, '');
    if (hour <= 24 && minute < 60) {
      if (meridiem === 'pm' && hour < 12) hour += 12;
      if (meridiem === 'am' && hour === 12) hour = 0;
      // No am/pm: pick the reading that is still ahead of us, favouring waking hours.
      if (!meridiem && hour < 12 && !dayAnchor) {
        const asAm = setLocalTime(localNow, hour, minute);
        if (asAm.getTime() <= localNow.getTime()) hour += 12;
      }
      const base = dayAnchor?.local ?? localNow;
      let at = setLocalTime(base, hour, minute);
      if (!dayAnchor && at.getTime() <= localNow.getTime()) at = new Date(at.getTime() + DAY);
      const matched = [dayAnchor?.matched, clock[0].trim()].filter(Boolean).join(' ');
      return { at: fromLocal(at, offsetMinutes), matched, confidence: meridiem ? 0.95 : 0.8 };
    }
  }

  // --- day part, with or without a day anchor ("tomorrow morning") --------
  const partMatch = lower.match(
    /\b(this\s+|tomorrow\s+|next\s+)?(morning|noon|midday|afternoon|evening|tonight|night|midnight)\b/,
  );
  if (partMatch) {
    const hour = DAYPARTS[partMatch[2]!]!;
    const base = dayAnchor?.local ?? localNow;
    let at = setLocalTime(base, hour, 0);
    if (!dayAnchor && at.getTime() <= localNow.getTime()) at = new Date(at.getTime() + DAY);
    const matched = [dayAnchor?.matched, partMatch[0].trim()].filter(Boolean).join(' ');
    return { at: fromLocal(at, offsetMinutes), matched, confidence: 0.7 };
  }

  // --- bare day anchor ("tomorrow", "next Tuesday") -> 9am default --------
  if (dayAnchor) {
    const at = setLocalTime(dayAnchor.local, 9, 0);
    return { at: fromLocal(at, offsetMinutes), matched: dayAnchor.matched, confidence: 0.6 };
  }

  return null;
}

type DayAnchor = { local: Date; matched: string };

function findDayAnchor(lower: string, localNow: Date): DayAnchor | null {
  if (/\btomorrow\b/.test(lower)) {
    return { local: new Date(localNow.getTime() + DAY), matched: 'tomorrow' };
  }
  if (/\bday after tomorrow\b/.test(lower)) {
    return { local: new Date(localNow.getTime() + 2 * DAY), matched: 'day after tomorrow' };
  }
  if (/\btoday\b/.test(lower)) return { local: localNow, matched: 'today' };

  const weekday = lower.match(
    /\b(?:(this|next|on)\s+)?(sunday|sun|monday|mon|tuesday|tues|tue|wednesday|wed|thursday|thurs|thur|thu|friday|fri|saturday|sat)\b/,
  );
  if (weekday) {
    const target = WEEKDAYS[weekday[2]!]!;
    const current = localNow.getUTCDay();
    let delta = (target - current + 7) % 7;
    // "next friday" and a same-day match both mean the *coming* one, not today.
    if (delta === 0) delta = 7;
    if (weekday[1] === 'next' && delta < 7) delta += 7;
    return { local: new Date(localNow.getTime() + delta * DAY), matched: weekday[0] };
  }
  return null;
}
