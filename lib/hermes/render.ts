import { escapeMarkdownV2 } from './channels/telegram';
import { describe, formatWhen, type Classification } from './intent';
import type { OutboundMessage } from './types';

// Turns one classified capture into every wire format at once. Doing it here
// (rather than per channel) keeps the agent-facing wording identical no matter
// which pipe it arrives through — which matters when Hermes parses it.

export type RenderInput = {
  captureId: string;
  transcript: string;
  capturedAt: Date;
  classification: Classification;
  device: { id: string; name: string; platform: string };
  timeZone?: string;
};

const ICONS: Record<Classification['intent'], string> = {
  REMINDER: '⏰',
  TASK: '✅',
  LIST_ADD: '🧾',
  NOTE: '📝',
  MESSAGE: '💬',
  QUESTION: '❓',
  TIMER: '⏱️',
  UNKNOWN: '🎙️',
};

export function render(input: RenderInput): OutboundMessage {
  const { classification: c } = input;
  const icon = ICONS[c.intent];
  const headline = describe(c, input.timeZone);

  // The agent gets the verbatim transcript alongside the interpretation — if we
  // misread the intent, Hermes still has the user's actual words to work from.
  const plainLines = [`${icon} ${headline}`];
  if (c.title.toLowerCase() !== input.transcript.toLowerCase()) {
    plainLines.push(`heard: "${input.transcript}"`);
  }
  plainLines.push(`via ${input.device.name}`);
  const plain = plainLines.join('\n');

  const mdLines = [`${icon} *${escapeMarkdownV2(c.intent.replace('_', ' '))}*`, escapeMarkdownV2(c.title)];
  if (c.dueAt) mdLines.push(`📅 ${escapeMarkdownV2(formatWhen(c.dueAt, input.timeZone))}`);
  if (c.listName) mdLines.push(`📋 ${escapeMarkdownV2(c.listName)}`);
  if (c.title.toLowerCase() !== input.transcript.toLowerCase()) {
    mdLines.push(`_${escapeMarkdownV2(`heard: "${input.transcript}"`)}_`);
  }
  mdLines.push(escapeMarkdownV2(`via ${input.device.name} · ${Math.round(c.confidence * 100)}% · ${c.classifier}`));

  return {
    captureId: input.captureId,
    plain,
    markdown: mdLines.join('\n'),
    subject: `[Hermes] ${headline}`.slice(0, 120),
    structured: {
      capture_id: input.captureId,
      intent: c.intent,
      title: c.title,
      list_name: c.listName,
      due_at: c.dueAt?.toISOString(),
      transcript: input.transcript,
      captured_at: input.capturedAt.toISOString(),
      confidence: c.confidence,
      classifier: c.classifier,
      device: input.device,
      time_zone: input.timeZone,
    },
  };
}
