import { z } from 'zod';

// Centralized request schemas. Every API route parses with these — never trust
// untyped JSON from the client.

export const CheckoutBody = z.object({
  plan: z.enum(['pro_monthly', 'pro_yearly']),
});

export const ScoreBody = z.object({
  runToken: z.string().min(20).max(2048),
  value: z.number().int().min(0).max(10_000_000),
  durationMs: z.number().int().min(0).max(30 * 60 * 1000),
});

export const LeaderboardQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  cursor: z.string().optional(),
});

// ---------- Hermes voice relay ----------

// One press-and-speak event. `clientId` is generated on the watch and is the
// idempotency key: an offline retry re-sends the same id and must not produce a
// second reminder.
export const CaptureBody = z.object({
  clientId: z.string().uuid(),
  transcript: z.string().min(1).max(2000),
  capturedAt: z.coerce.date(),
  // Minutes to ADD to UTC for the speaker's local time; PDT is -420.
  utcOffsetMinutes: z.number().int().min(-840).max(840).default(0),
  timeZone: z.string().max(64).optional(),
  // Hint from the watch UI ("long press = note"), used only as a tiebreak.
  intentHint: z
    .enum(['REMINDER', 'TASK', 'LIST_ADD', 'NOTE', 'MESSAGE', 'QUESTION', 'TIMER'])
    .optional(),
  source: z.enum(['action_button', 'double_tap', 'complication', 'app', 'siri', 'phone']).default('app'),
  // Coarse location, opt-in on the device, for "remind me when I'm near X".
  location: z
    .object({ lat: z.number().min(-90).max(90), lon: z.number().min(-180).max(180) })
    .optional(),
  batteryLevel: z.number().min(0).max(1).optional(),
});

// The watch sends a whole offline backlog in one signed request.
export const CaptureBatchBody = z.object({
  captures: z.array(CaptureBody).min(1).max(25),
});

export const PairBody = z.object({
  code: z.string().min(8).max(16),
  deviceName: z.string().min(1).max(64),
  platform: z.enum(['WATCHOS', 'IOS', 'MACOS', 'OTHER']).default('WATCHOS'),
  model: z.string().max(64).optional(),
});

export const InboxQuery = z.object({
  since: z.coerce.date().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export const DeviceRevokeBody = z.object({
  deviceId: z.string().min(1).max(64),
});
