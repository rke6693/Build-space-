import { parseWhen } from './chrono';

// ---------------------------------------------------------------------------
// Deterministic intent classification.
//
// This always runs, offline, in under a millisecond. The optional LLM pass in
// ./llm.ts refines the result — it never replaces it, so a missing API key,
// a rate limit, or a timeout degrades the capture to "still correct, slightly
// less clever" rather than "lost".
// ---------------------------------------------------------------------------

export type Intent =
  | 'REMINDER'
  | 'TASK'
  | 'LIST_ADD'
  | 'NOTE'
  | 'MESSAGE'
  | 'QUESTION'
  | 'TIMER'
  | 'UNKNOWN';

export type Classification = {
  intent: Intent;
  /** The imperative, cleaned of the wrapper phrase and the time expression. */
  title: string;
  /** For LIST_ADD: which list ("groceries", "reading"). */
  listName?: string;
  dueAt?: Date;
  confidence: number;
  classifier: 'heuristic' | 'llm';
};

type Rule = {
  intent: Intent;
  /** Capturing group 1 becomes the title. */
  pattern: RegExp;
  confidence: number;
  listFrom?: number;
};

// Ordered: the first match wins, so the most specific wrappers come first.
const RULES: Rule[] = [
  // "remind me to X" / "remind me that X" / "don't let me forget to X"
  {
    intent: 'REMINDER',
    pattern: /^(?:hey\s+)?(?:hermes[,\s]+)?(?:please\s+)?remind\s+me\s+(?:to|that|about)\s+(.+)$/i,
    confidence: 0.95,
  },
  {
    intent: 'REMINDER',
    pattern: /^(?:don'?t\s+(?:let\s+me\s+)?forget|remember)\s+(?:to|that|about)\s+(.+)$/i,
    confidence: 0.9,
  },
  // "set a timer for 10 minutes"
  {
    intent: 'TIMER',
    pattern: /^(?:set|start)\s+(?:a\s+)?(?:timer|alarm)\s+(?:for\s+)?(.+)$/i,
    confidence: 0.9,
  },
  // "add milk to my grocery list" — list name is group 2.
  {
    intent: 'LIST_ADD',
    pattern: /^(?:please\s+)?add\s+(.+?)\s+to\s+(?:my\s+|the\s+)?(.+?)(?:\s+list)?$/i,
    confidence: 0.9,
    listFrom: 2,
  },
  // "put X on the shopping list"
  {
    intent: 'LIST_ADD',
    pattern: /^(?:please\s+)?put\s+(.+?)\s+on\s+(?:my\s+|the\s+)?(.+?)(?:\s+list)?$/i,
    confidence: 0.85,
    listFrom: 2,
  },
  // "add X to my list" with no name -> inbox list.
  { intent: 'LIST_ADD', pattern: /^(?:please\s+)?add\s+(.+?)\s+to\s+(?:my\s+|the\s+)?list$/i, confidence: 0.85 },
  // "tell Sarah I'm running late" / "text Mike that ..."
  {
    intent: 'MESSAGE',
    pattern: /^(?:tell|text|message|ping|email)\s+(.+)$/i,
    confidence: 0.85,
  },
  // Explicit task wrappers.
  {
    intent: 'TASK',
    pattern: /^(?:add\s+(?:a\s+)?(?:task|todo|to-do)|create\s+(?:a\s+)?task|new\s+task)\s*(?:to|:)?\s*(.+)$/i,
    confidence: 0.9,
  },
  { intent: 'TASK', pattern: /^(?:i\s+need\s+to|i\s+have\s+to|i\s+should|make\s+sure\s+(?:i|to))\s+(.+)$/i, confidence: 0.8 },
  // Notes.
  {
    intent: 'NOTE',
    pattern: /^(?:note\s+to\s+self|take\s+a\s+note|make\s+a\s+note|jot\s+down|note)\s*(?:that|:)?\s*(.+)$/i,
    confidence: 0.9,
  },
  { intent: 'NOTE', pattern: /^(?:idea|thought)\s*(?::|—|-)?\s*(.+)$/i, confidence: 0.75 },
];

const QUESTION_OPENERS =
  /^(?:what|when|where|who|why|how|which|is|are|can|could|would|should|do|does|did|will)\b/i;

// Wrapper noise that survives the rule match and shouldn't reach the title.
const LEADING_FILLER = /^(?:um+|uh+|so|okay|ok|hey|hermes|please|just)\b[\s,]*/i;

/**
 * @param offsetMinutes minutes to ADD to UTC for the speaker's local time.
 */
export function classify(transcript: string, now = new Date(), offsetMinutes = 0): Classification {
  const text = normalize(transcript);
  if (!text) {
    return { intent: 'UNKNOWN', title: '', confidence: 0, classifier: 'heuristic' };
  }

  for (const rule of RULES) {
    const m = text.match(rule.pattern);
    if (!m) continue;

    const rawTitle = (m[1] ?? '').trim();
    const listName = rule.listFrom ? cleanList(m[rule.listFrom]) : undefined;

    // A timer's whole payload *is* the duration, so parse it from the match,
    // not the full sentence — "set a timer for 10 minutes" must not also try to
    // read "10" as a clock time.
    const timeSource = rule.intent === 'TIMER' ? `in ${rawTitle}` : text;
    const when = parseWhen(timeSource, now, offsetMinutes);

    let title = rawTitle;
    if (when && rule.intent !== 'TIMER') title = stripMatched(title, when.matched);
    title = tidy(title);

    // A dated "task" is really a reminder — that's how the user will expect it
    // to behave downstream.
    const intent = rule.intent === 'TASK' && when ? 'REMINDER' : rule.intent;

    return {
      intent,
      title: rule.intent === 'TIMER' ? tidy(rawTitle) : title,
      listName,
      dueAt: when?.at,
      confidence: Math.min(0.99, rule.confidence * (when ? 1 : 0.95)),
      classifier: 'heuristic',
    };
  }

  // No wrapper matched. Fall back on shape.
  const when = parseWhen(text, now, offsetMinutes);
  if (text.endsWith('?') || QUESTION_OPENERS.test(text)) {
    return { intent: 'QUESTION', title: tidy(text), confidence: 0.6, classifier: 'heuristic' };
  }
  if (when) {
    return {
      intent: 'REMINDER',
      title: tidy(stripMatched(text, when.matched)),
      dueAt: when.at,
      confidence: 0.55,
      classifier: 'heuristic',
    };
  }
  return { intent: 'NOTE', title: tidy(text), confidence: 0.4, classifier: 'heuristic' };
}

function normalize(s: string): string {
  return s.replace(/\s+/g, ' ').trim().replace(LEADING_FILLER, '').trim();
}

function stripMatched(s: string, matched: string): string {
  if (!matched) return s;
  const escaped = matched.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return s
    .replace(new RegExp(`\\b(?:at|on|by|around|before)\\s+${escaped}`, 'i'), '')
    .replace(new RegExp(`\\b${escaped}`, 'i'), '')
    .replace(/\s+/g, ' ')
    .trim();
}

function tidy(s: string): string {
  const cleaned = s
    .replace(LEADING_FILLER, '')
    .replace(/^[,\s]+|[,\s]+$/g, '')
    .replace(/\s+([,.!?])/g, '$1')
    .replace(/\.$/, '');
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

function cleanList(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const name = raw
    .replace(/^(?:my|the)\s+/i, '')
    .replace(/\s+list$/i, '')
    .trim()
    .toLowerCase();
  // "add sunscreen to my list" leaves the bare word behind — that is the
  // default inbox list, not a list called "list".
  return !name || name === 'list' ? undefined : name;
}

/** One-line human summary, used in notifications and on the watch confirmation. */
export function describe(c: Classification, timeZone?: string): string {
  const when = c.dueAt ? ` — ${formatWhen(c.dueAt, timeZone)}` : '';
  switch (c.intent) {
    case 'REMINDER':
      return `Reminder: ${c.title}${when}`;
    case 'TASK':
      return `Task: ${c.title}`;
    case 'LIST_ADD':
      return `${c.listName ? `${c.listName} list` : 'List'}: + ${c.title}`;
    case 'NOTE':
      return `Note: ${c.title}`;
    case 'MESSAGE':
      return `Message: ${c.title}`;
    case 'QUESTION':
      return `Question: ${c.title}`;
    case 'TIMER':
      return `Timer: ${c.title}`;
    default:
      return c.title;
  }
}

export function formatWhen(date: Date, timeZone?: string): string {
  try {
    return new Intl.DateTimeFormat('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZone: timeZone || 'UTC',
      timeZoneName: 'short',
    }).format(date);
  } catch {
    // Invalid IANA name from a device we don't control — never fail a capture over it.
    return date.toISOString();
  }
}
