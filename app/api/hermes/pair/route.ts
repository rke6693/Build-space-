import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { env } from '@/lib/env';
import { hashPairingCode, newDeviceSecret, sealSecret } from '@/lib/hermes/crypto';
import { logger } from '@/lib/logger';
import { clientIp, limiters } from '@/lib/ratelimit';
import { PairBody } from '@/lib/validation';

// Redeem a pairing code shown in the web dashboard, in exchange for a device
// secret. This is the one moment the secret exists on the wire — afterwards the
// device only ever sends signatures derived from it.
//
// Unauthenticated by design (the watch has no session cookie); the short-lived,
// single-use, rate-limited code *is* the authentication.

export async function POST(req: Request) {
  const ip = clientIp(req);
  // Tight limit: an 8-character code is ~40 bits, and 10 guesses a minute makes
  // brute force hopeless inside the 10-minute window.
  const rl = await limiters.auth.limit(`hermes:pair:${ip}`);
  if (!rl.success) return NextResponse.json({ ok: false, error: 'too many requests' }, { status: 429 });

  if (!req.headers.get('content-type')?.includes('application/json')) {
    return NextResponse.json({ ok: false, error: 'bad content type' }, { status: 415 });
  }

  const parsed = PairBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: 'invalid body' }, { status: 400 });

  const { code, deviceName, platform, model } = parsed.data;
  const codeHash = hashPairingCode(code);

  // Single-use: claim the row before creating anything, so two devices racing on
  // one code cannot both pair.
  const claimed = await db.hermesPairing.updateMany({
    where: { codeHash, redeemedAt: null, expiresAt: { gt: new Date() } },
    data: { redeemedAt: new Date() },
  });
  if (claimed.count === 0) {
    return NextResponse.json({ ok: false, error: 'invalid or expired code' }, { status: 400 });
  }

  const pairing = await db.hermesPairing.findUnique({
    where: { codeHash },
    select: { id: true, userId: true },
  });
  if (!pairing) return NextResponse.json({ ok: false, error: 'invalid or expired code' }, { status: 400 });

  const secret = newDeviceSecret();
  const device = await db.hermesDevice.create({
    data: {
      userId: pairing.userId,
      name: deviceName,
      platform,
      model,
      secretCiphertext: sealSecret(secret, env.AUTH_SECRET),
    },
    select: { id: true, name: true },
  });

  await db.hermesPairing.update({ where: { id: pairing.id }, data: { deviceId: device.id } }).catch(() => {});
  await db.auditLog
    .create({
      data: {
        userId: pairing.userId,
        event: 'HERMES_DEVICE_PAIRED',
        ip,
        meta: { deviceId: device.id, platform, model: model ?? null },
      },
    })
    .catch(() => {});

  logger.info({ userId: pairing.userId, deviceId: device.id, platform }, 'hermes device paired');

  return NextResponse.json({
    ok: true,
    deviceId: device.id,
    deviceSecret: secret, // shown exactly once; the device stores it in the Keychain
    endpoint: env.NEXTAUTH_URL,
  });
}
