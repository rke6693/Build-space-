import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { env } from '@/lib/env';
import { hashPairingCode, newPairingCode } from '@/lib/hermes/crypto';
import { clientIp, limiters } from '@/lib/ratelimit';
import { isSameOrigin } from '@/lib/security';
import { DeviceRevokeBody } from '@/lib/validation';

// Session-authenticated device management, called from the /hermes dashboard.
// This is the browser half of pairing; the watch half is /api/hermes/pair.

const PAIRING_TTL_MS = 10 * 60 * 1000;

/** List the user's paired devices. */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const devices = await db.hermesDevice.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: 'desc' },
    select: { id: true, name: true, platform: true, model: true, createdAt: true, lastSeenAt: true, revokedAt: true },
  });
  return NextResponse.json({ ok: true, devices });
}

/** Mint a pairing code to type into the phone app. */
export async function POST(req: Request) {
  if (!isSameOrigin(req, env.NEXTAUTH_URL)) {
    return NextResponse.json({ error: 'bad origin' }, { status: 403 });
  }
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const rl = await limiters.api.limit(`hermes:code:${session.user.id}`);
  if (!rl.success) return NextResponse.json({ error: 'too many requests' }, { status: 429 });

  const code = newPairingCode();
  const expiresAt = new Date(Date.now() + PAIRING_TTL_MS);

  // Only the hash is stored: a database reader cannot pair a device of their own.
  await db.hermesPairing.create({
    data: { userId: session.user.id, codeHash: hashPairingCode(code), expiresAt },
  });

  return NextResponse.json({ ok: true, code, expiresAt: expiresAt.toISOString() });
}

/** Revoke a device. Its secret stops verifying on the very next request. */
export async function DELETE(req: Request) {
  if (!isSameOrigin(req, env.NEXTAUTH_URL)) {
    return NextResponse.json({ error: 'bad origin' }, { status: 403 });
  }
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const parsed = DeviceRevokeBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'invalid body' }, { status: 400 });

  // Owner-scoped update: no IDOR even with a guessed device id.
  const revoked = await db.hermesDevice.updateMany({
    where: { id: parsed.data.deviceId, userId: session.user.id, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  if (revoked.count === 0) return NextResponse.json({ error: 'not found' }, { status: 404 });

  await db.auditLog
    .create({
      data: {
        userId: session.user.id,
        event: 'HERMES_DEVICE_REVOKED',
        ip: clientIp(req),
        meta: { deviceId: parsed.data.deviceId },
      },
    })
    .catch(() => {});

  return NextResponse.json({ ok: true });
}
