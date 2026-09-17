import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authenticateDevice } from '@/lib/hermes/device';
import { limiters } from '@/lib/ratelimit';
import { InboxQuery } from '@/lib/validation';

// The return path: replies Hermes sent back (via the Telegram webhook below)
// show up on the wrist. Polled, not pushed — APNs would need a certificate and
// a signing key the relay has no business holding, and a watch that polls on
// wake is indistinguishable in practice for this volume.

export async function GET(req: Request) {
  // A GET has no body, but the empty string still participates in the signature
  // so the query string stays covered.
  const auth = await authenticateDevice(req, '');
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.reason }, { status: auth.status });

  const rl = await limiters.api.limit(`hermes:inbox:${auth.device.id}`);
  if (!rl.success) return NextResponse.json({ ok: false, error: 'too many requests' }, { status: 429 });

  const url = new URL(req.url);
  const parsed = InboxQuery.safeParse({
    since: url.searchParams.get('since') ?? undefined,
    limit: url.searchParams.get('limit') ?? undefined,
  });
  if (!parsed.success) return NextResponse.json({ ok: false, error: 'invalid query' }, { status: 400 });

  const messages = await db.hermesMessage.findMany({
    where: {
      userId: auth.device.userId,
      ...(parsed.data.since ? { createdAt: { gt: parsed.data.since } } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: parsed.data.limit,
    select: { id: true, channel: true, body: true, createdAt: true, readAt: true },
  });

  return NextResponse.json({
    ok: true,
    messages: messages.map((m) => ({
      id: m.id,
      channel: m.channel,
      body: m.body,
      createdAt: m.createdAt.toISOString(),
      read: !!m.readAt,
    })),
  });
}

// Marking read is a device action, so it is signed like any other.
export async function POST(req: Request) {
  const rawBody = await req.text();
  const auth = await authenticateDevice(req, rawBody);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.reason }, { status: auth.status });

  let ids: string[] = [];
  try {
    const body = JSON.parse(rawBody || '{}') as { ids?: unknown };
    if (Array.isArray(body.ids)) ids = body.ids.filter((v): v is string => typeof v === 'string').slice(0, 50);
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid json' }, { status: 400 });
  }
  if (ids.length === 0) return NextResponse.json({ ok: true, updated: 0 });

  // Owner-scoped: a device can only mark its own user's messages read.
  const updated = await db.hermesMessage.updateMany({
    where: { id: { in: ids }, userId: auth.device.userId, readAt: null },
    data: { readAt: new Date() },
  });
  return NextResponse.json({ ok: true, updated: updated.count });
}
