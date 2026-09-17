import { NextResponse } from 'next/server';
import type { CaptureIntent, DeliveryChannel, DeliveryStatus } from '@prisma/client';
import { db } from '@/lib/db';
import { authenticateDevice, type DeviceIdentity } from '@/lib/hermes/device';
import { dispatch } from '@/lib/hermes/dispatch';
import { classify, describe, type Classification } from '@/lib/hermes/intent';
import { refine } from '@/lib/hermes/llm';
import { render } from '@/lib/hermes/render';
import { logger } from '@/lib/logger';
import { limiters } from '@/lib/ratelimit';
import { CaptureBatchBody, CaptureBody } from '@/lib/validation';
import { z } from 'zod';

// The endpoint the watch talks to. One signed POST carries either a single
// capture or the whole offline backlog.
//
// Everything here is built around one rule: the user already spoke, so losing
// the capture is the only unacceptable outcome. Classification degrades,
// channels degrade, but an accepted capture is always persisted first.

export const maxDuration = 30;

// Accept a bare capture or a batch envelope — the watch always sends the
// envelope, but a shell script or a Shortcut can post the simple shape.
const Body = z.union([CaptureBatchBody, CaptureBody.transform((c) => ({ captures: [c] }))]);

export async function POST(req: Request) {
  // Read the body as text first: the signature covers the exact bytes, so we
  // cannot let req.json() re-serialize them.
  const rawBody = await req.text();
  if (rawBody.length > 64_000) {
    return NextResponse.json({ ok: false, error: 'payload too large' }, { status: 413 });
  }

  const auth = await authenticateDevice(req, rawBody);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.reason }, { status: auth.status });
  }
  const { device } = auth;

  const rl = await limiters.api.limit(`hermes:capture:${device.id}`);
  if (!rl.success) {
    return NextResponse.json({ ok: false, error: 'too many requests' }, { status: 429 });
  }

  let json: unknown;
  try {
    json = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid json' }, { status: 400 });
  }

  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'invalid body' }, { status: 400 });
  }

  // Bounded concurrency: a 25-capture backlog should not open 25 simultaneous
  // conversations with Telegram, but it also must not run serially and blow the
  // function's wall clock.
  const results = await mapWithConcurrency(parsed.data.captures, 4, (capture) =>
    handleCapture(device, capture),
  );

  return NextResponse.json({ ok: true, results });
}

type CaptureInput = z.infer<typeof CaptureBody>;

type CaptureResult = {
  clientId: string;
  captureId: string;
  duplicate: boolean;
  intent: CaptureIntent;
  title: string;
  dueAt: string | null;
  /** Short line the watch shows on the confirmation screen. */
  summary: string;
  status: 'DELIVERED' | 'PARTIAL' | 'FAILED';
  deliveries: { channel: DeliveryChannel; status: DeliveryStatus; detail?: string }[];
};

async function handleCapture(device: DeviceIdentity, input: CaptureInput): Promise<CaptureResult> {
  // --- Idempotency -------------------------------------------------------
  // A watch that lost the response mid-flight retries with the same clientId.
  // Return the original outcome instead of creating a second reminder.
  const existing = await db.hermesCapture.findUnique({
    where: { deviceId_clientId: { deviceId: device.id, clientId: input.clientId } },
    select: {
      id: true, intent: true, title: true, dueAt: true, status: true, listName: true, confidence: true,
      classifier: true, deliveries: { select: { channel: true, status: true, detail: true } },
    },
  });
  if (existing) {
    return {
      clientId: input.clientId,
      captureId: existing.id,
      duplicate: true,
      intent: existing.intent,
      title: existing.title ?? '',
      dueAt: existing.dueAt?.toISOString() ?? null,
      summary: describe(
        {
          intent: existing.intent,
          title: existing.title ?? '',
          listName: existing.listName ?? undefined,
          dueAt: existing.dueAt ?? undefined,
          confidence: existing.confidence,
          classifier: existing.classifier as Classification['classifier'],
        },
        input.timeZone,
      ),
      status: existing.status === 'PENDING' ? 'FAILED' : (existing.status as CaptureResult['status']),
      deliveries: existing.deliveries.map((d) => ({
        channel: d.channel,
        status: d.status,
        detail: d.detail ?? undefined,
      })),
    };
  }

  // --- Classification ----------------------------------------------------
  const now = new Date();
  const heuristic = classify(input.transcript, now, input.utcOffsetMinutes);

  const knownLists = await recentListNames(device.userId);
  const llm = await refine({
    transcript: input.transcript,
    now,
    offsetMinutes: input.utcOffsetMinutes,
    timeZone: input.timeZone,
    knownLists,
  });

  const classification = merge(heuristic, llm, input.intentHint);

  // --- Persist before dispatch ------------------------------------------
  const capture = await db.hermesCapture.create({
    data: {
      userId: device.userId,
      deviceId: device.id,
      clientId: input.clientId,
      transcript: input.transcript,
      intent: classification.intent,
      title: classification.title,
      listName: classification.listName,
      dueAt: classification.dueAt,
      confidence: classification.confidence,
      classifier: classification.classifier,
      capturedAt: input.capturedAt,
      status: 'PENDING',
      meta: {
        source: input.source,
        timeZone: input.timeZone ?? null,
        utcOffsetMinutes: input.utcOffsetMinutes,
        batteryLevel: input.batteryLevel ?? null,
        location: input.location ?? null,
        heuristic: { intent: heuristic.intent, confidence: heuristic.confidence },
      },
    },
    select: { id: true },
  });

  // --- Fan out -----------------------------------------------------------
  const message = render({
    captureId: capture.id,
    transcript: input.transcript,
    capturedAt: input.capturedAt,
    classification,
    device: { id: device.id, name: device.name, platform: device.platform },
    timeZone: input.timeZone,
  });

  const outcome = await dispatch(message);

  await db.$transaction([
    db.hermesCapture.update({ where: { id: capture.id }, data: { status: outcome.status } }),
    db.hermesDelivery.createMany({
      data: outcome.results.map((r) => ({
        captureId: capture.id,
        channel: r.channel,
        status: r.status,
        detail: r.detail?.slice(0, 500),
        latencyMs: r.latencyMs,
      })),
    }),
  ]);

  await db.auditLog
    .create({
      data: {
        userId: device.userId,
        event: 'HERMES_CAPTURE_RECEIVED',
        meta: {
          captureId: capture.id,
          deviceId: device.id,
          intent: classification.intent,
          status: outcome.status,
          source: input.source,
        },
      },
    })
    .catch(() => {});

  if (outcome.status === 'FAILED') {
    logger.error(
      { captureId: capture.id, deviceId: device.id, results: outcome.results },
      'hermes capture reached no channel',
    );
  }

  return {
    clientId: input.clientId,
    captureId: capture.id,
    duplicate: false,
    intent: classification.intent,
    title: classification.title,
    dueAt: classification.dueAt?.toISOString() ?? null,
    summary: describe(classification, input.timeZone),
    status: outcome.status,
    deliveries: outcome.results.map((r) => ({
      channel: r.channel,
      status: r.status,
      detail: r.detail,
    })),
  };
}

/**
 * The heuristic pass is the floor; the LLM can only raise it. Merging per field
 * (rather than picking one wholesale) means a model that nails the title but
 * drops the time still keeps the regex-parsed due date.
 */
function merge(
  heuristic: Classification,
  llm: Classification | null,
  hint?: CaptureInput['intentHint'],
): Classification {
  let merged: Classification;
  if (!llm) {
    merged = heuristic;
  } else {
    merged = {
      intent: llm.intent === 'UNKNOWN' ? heuristic.intent : llm.intent,
      title: llm.title.trim() || heuristic.title,
      listName: llm.listName ?? heuristic.listName,
      dueAt: llm.dueAt ?? heuristic.dueAt,
      confidence: Math.max(llm.confidence, heuristic.confidence),
      classifier: 'llm',
    };
  }

  // The UI hint (long-press = note, complication = task) only breaks ties when
  // the language itself was ambiguous.
  if (hint && merged.confidence < 0.5) {
    merged = { ...merged, intent: hint, confidence: 0.5 };
  }
  return merged;
}

/** Feeds the model the user's existing lists so it routes to "groceries" rather than inventing "grocery". */
async function recentListNames(userId: string): Promise<string[]> {
  const rows = await db.hermesCapture
    .findMany({
      where: { userId, listName: { not: null } },
      select: { listName: true },
      distinct: ['listName'],
      orderBy: { capturedAt: 'desc' },
      take: 10,
    })
    .catch(() => []);
  return rows.map((r) => r.listName!).filter(Boolean);
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const out = new Array<R>(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      out[index] = await fn(items[index]!);
    }
  });
  await Promise.all(workers);
  return out;
}
