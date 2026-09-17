import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
// zod/v4 specifically: the SDK's output-format helper is typed against the v4
// core, which zod 3.25 ships alongside the classic v3 API the rest of the app
// uses. Both live in the same install; only this schema needs the v4 surface.
import * as z from 'zod/v4';
import { logger } from '@/lib/logger';
import type { Classification, Intent } from './intent';

// ---------------------------------------------------------------------------
// Optional refinement pass over the heuristic classification.
//
// Contract with the caller: this function never throws and never blocks past
// its timeout. If ANTHROPIC_API_KEY is unset, it returns null immediately and
// the heuristic result stands. Everything here is an *upgrade* to an answer we
// already have.
//
// What it buys over the regex pass: multi-clause captures ("remind me to call
// mom and add batteries to the hardware list"), messy dictation, implicit
// times ("before my flight"), and a cleaned-up imperative title.
// ---------------------------------------------------------------------------

const MODEL = process.env.HERMES_LLM_MODEL ?? 'claude-opus-5';
const TIMEOUT_MS = Number.parseInt(process.env.HERMES_LLM_TIMEOUT_MS ?? '6000', 10);

// Effort is deliberately low: this sits on the critical path between the user
// lifting their wrist and feeling the confirmation haptic. Extraction from one
// spoken sentence does not need deep reasoning, and the heuristic result is
// already a correct floor. Raise HERMES_LLM_EFFORT if you add richer routing.
const EFFORT = (process.env.HERMES_LLM_EFFORT ?? 'low') as 'low' | 'medium' | 'high';

const INTENTS = [
  'REMINDER',
  'TASK',
  'LIST_ADD',
  'NOTE',
  'MESSAGE',
  'QUESTION',
  'TIMER',
  'UNKNOWN',
] as const;

const ExtractionSchema = z.object({
  intent: z.enum(INTENTS),
  title: z.string().describe('The imperative, cleaned of filler and of the time phrase. No trailing period.'),
  list_name: z
    .string()
    .describe('For LIST_ADD only, the list this belongs on (e.g. "groceries"). Empty string otherwise.'),
  due_at: z
    .string()
    .describe('ISO-8601 instant with offset, or empty string when no time was spoken.'),
  recipient: z
    .string()
    .describe('For MESSAGE only, who it is addressed to. Empty string otherwise.'),
  confidence: z.number().min(0).max(1),
});

const SYSTEM = `You convert a single spoken phrase, captured on an Apple Watch and transcribed on-device, into one structured action for a personal assistant agent.

Rules:
- The transcript is speech: expect filler words, missing punctuation, and homophone errors ("by milk" = "buy milk"). Correct obvious dictation errors in the title.
- The title is what the user must DO, phrased as an imperative, with the wrapper phrase removed ("remind me to call mom" -> "Call mom"). Never include the time phrase in the title.
- Resolve relative times ("tomorrow at 4", "in 20 minutes", "friday morning") against the supplied current local time, and return them with the user's UTC offset. Prefer the next future occurrence. A bare day with no clock time means 9:00 local.
- Intent guide: REMINDER (time-bound), TASK (to do, no time), LIST_ADD (belongs on a named list), NOTE (capture a thought), MESSAGE (send to a person), QUESTION (asking the agent something), TIMER (countdown), UNKNOWN (unintelligible).
- If the phrase contains several actions, return the single most important one and leave the rest in the title.
- Never invent a time that was not spoken or implied.`;

let client: Anthropic | null | undefined;

function getClient(): Anthropic | null {
  if (client !== undefined) return client;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  // maxRetries 0: a retry would blow the latency budget, and the heuristic
  // result is already good enough to ship.
  client = apiKey ? new Anthropic({ apiKey, maxRetries: 0 }) : null;
  return client;
}

export function llmRefinementEnabled(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}

export type RefineContext = {
  transcript: string;
  now: Date;
  /** Minutes to ADD to UTC for the speaker's local time (PDT = -420). */
  offsetMinutes: number;
  timeZone?: string;
  /** Known list names, so the model routes to an existing list instead of inventing one. */
  knownLists?: string[];
};

export async function refine(ctx: RefineContext): Promise<Classification | null> {
  const anthropic = getClient();
  if (!anthropic) return null;

  const localNow = new Date(ctx.now.getTime() + ctx.offsetMinutes * 60_000)
    .toISOString()
    .replace('Z', formatOffset(ctx.offsetMinutes));

  const lists = ctx.knownLists?.length
    ? `\nLists this user already has: ${ctx.knownLists.join(', ')}.`
    : '';

  try {
    const response = await anthropic.messages.parse(
      {
        model: MODEL,
        max_tokens: 1024,
        // The system prompt is byte-stable across every capture, so it caches.
        system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
        output_config: { format: zodOutputFormat(ExtractionSchema), effort: EFFORT },
        messages: [
          {
            role: 'user',
            content: `Current local time: ${localNow}${ctx.timeZone ? ` (${ctx.timeZone})` : ''}.${lists}\n\nTranscript: "${ctx.transcript}"`,
          },
        ],
      },
      { timeout: TIMEOUT_MS },
    );

    const parsed = response.parsed_output;
    if (!parsed) return null;

    const dueAt = parsed.due_at ? new Date(parsed.due_at) : undefined;
    return {
      intent: parsed.intent as Intent,
      title: parsed.title.trim(),
      listName: parsed.list_name?.trim() || undefined,
      dueAt: dueAt && !Number.isNaN(dueAt.getTime()) ? dueAt : undefined,
      confidence: parsed.confidence,
      classifier: 'llm',
    };
  } catch (err) {
    // Rate limit, timeout, bad key, transient 5xx — all the same to us: the
    // heuristic classification is already on its way out the door.
    logger.warn({ err: errMessage(err) }, 'hermes llm refinement failed; using heuristic');
    return null;
  }
}

function formatOffset(minutes: number): string {
  const sign = minutes < 0 ? '-' : '+';
  const abs = Math.abs(minutes);
  const hh = String(Math.floor(abs / 60)).padStart(2, '0');
  const mm = String(abs % 60).padStart(2, '0');
  return `${sign}${hh}:${mm}`;
}

function errMessage(err: unknown): string {
  if (err instanceof Anthropic.APIError) return `${err.status ?? 'api'}: ${err.message}`;
  return err instanceof Error ? err.message : String(err);
}
