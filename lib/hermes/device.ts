import { db } from '@/lib/db';
import { env } from '@/lib/env';
import { logger } from '@/lib/logger';
import {
  SIGNATURE_HEADERS,
  SIGNATURE_SKEW_MS,
  openSecret,
  verifySignature,
} from './crypto';

// ---------------------------------------------------------------------------
// Authenticating a signed request from a paired device.
//
// Three independent gates, in cheapest-first order:
//   1. the device exists, belongs to someone, and is not revoked;
//   2. the HMAC over (method, path, timestamp, nonce, body digest) verifies;
//   3. the nonce has never been seen — enforced by a unique insert, so two
//      concurrent replays cannot both win.
// ---------------------------------------------------------------------------

export type DeviceIdentity = {
  id: string;
  userId: string;
  name: string;
  platform: string;
};

export type AuthResult =
  | { ok: true; device: DeviceIdentity }
  | { ok: false; status: 401 | 403 | 409; reason: string };

export async function authenticateDevice(req: Request, rawBody: string): Promise<AuthResult> {
  const deviceId = req.headers.get(SIGNATURE_HEADERS.device);
  const timestampRaw = req.headers.get(SIGNATURE_HEADERS.timestamp);
  const nonce = req.headers.get(SIGNATURE_HEADERS.nonce);
  const signature = req.headers.get(SIGNATURE_HEADERS.signature);

  if (!deviceId || !timestampRaw || !nonce || !signature) {
    return { ok: false, status: 401, reason: 'missing signature headers' };
  }
  // Bound the nonce so a device cannot fill the table with one huge row.
  if (nonce.length < 8 || nonce.length > 128) {
    return { ok: false, status: 401, reason: 'bad nonce' };
  }

  const timestamp = Number.parseInt(timestampRaw, 10);
  if (!Number.isFinite(timestamp)) {
    return { ok: false, status: 401, reason: 'bad timestamp' };
  }

  const device = await db.hermesDevice.findUnique({
    where: { id: deviceId },
    select: { id: true, userId: true, name: true, platform: true, revokedAt: true, secretCiphertext: true },
  });
  if (!device) return { ok: false, status: 401, reason: 'unknown device' };
  if (device.revokedAt) return { ok: false, status: 403, reason: 'device revoked' };

  const secret = openSecret(device.secretCiphertext, env.AUTH_SECRET);
  if (!secret) {
    // AUTH_SECRET was rotated (or the row was tampered with). The device has to
    // be paired again; say so plainly rather than looking like a bad signature.
    logger.warn({ deviceId }, 'hermes device secret could not be unsealed');
    return { ok: false, status: 403, reason: 'device must be re-paired' };
  }

  const url = new URL(req.url);
  const verdict = verifySignature(
    {
      method: req.method,
      path: `${url.pathname}${url.search}`,
      timestamp,
      nonce,
      body: rawBody,
    },
    secret,
    signature,
  );
  if (!verdict.ok) {
    await audit(device.userId, deviceId, verdict.reason);
    return { ok: false, status: 401, reason: verdict.reason };
  }

  // Replay window == signature window: a nonce only needs to outlive the period
  // in which its timestamp would still be accepted.
  const expiresAt = new Date(Date.now() + SIGNATURE_SKEW_MS);
  try {
    await db.hermesNonce.create({ data: { deviceId, nonce, expiresAt } });
  } catch {
    // Unique violation on (deviceId, nonce) — this exact request already ran.
    await audit(device.userId, deviceId, 'replayed_nonce');
    return { ok: false, status: 409, reason: 'replayed request' };
  }

  // Opportunistic sweep; a cron would also work but this keeps deploys simple.
  if (Math.random() < 0.02) {
    db.hermesNonce.deleteMany({ where: { expiresAt: { lt: new Date() } } }).catch(() => {});
  }

  db.hermesDevice
    .update({ where: { id: deviceId }, data: { lastSeenAt: new Date() } })
    .catch(() => {}); // last-seen is telemetry; never fail a capture over it

  return {
    ok: true,
    device: { id: device.id, userId: device.userId, name: device.name, platform: device.platform },
  };
}

async function audit(userId: string, deviceId: string, reason: string): Promise<void> {
  logger.warn({ userId, deviceId, reason }, 'hermes signature rejected');
  await db.auditLog
    .create({ data: { userId, event: 'HERMES_SIGNATURE_REJECTED', meta: { deviceId, reason } } })
    .catch(() => {});
}
