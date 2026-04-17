import crypto from 'node:crypto';

// A run token is a tamper-proof envelope proving the server authorized a run.
// Layout: base64url(payload).base64url(hmacSha256(payload, RUN_TOKEN_SECRET))
// The nonce also exists as a row in the `Run` table so we can enforce single-use
// transactionally; HMAC alone is insufficient because attackers could replay.

export type RunPayload = {
  runId: string;
  userId: string;
  nonce: string;
  iat: number; // issued at (ms)
  exp: number; // expires at (ms)
};

function b64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecode(s: string): Buffer {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/') + pad, 'base64');
}

function sign(payload: string, secret: string): string {
  return b64url(crypto.createHmac('sha256', secret).update(payload).digest());
}

export function issueRunToken(payload: RunPayload, secret: string): string {
  const body = b64url(Buffer.from(JSON.stringify(payload)));
  return `${body}.${sign(body, secret)}`;
}

export type VerifyResult =
  | { ok: true; payload: RunPayload }
  | { ok: false; reason: 'malformed' | 'bad_signature' | 'expired' };

export function verifyRunToken(token: string, secret: string, now = Date.now()): VerifyResult {
  const parts = token.split('.');
  if (parts.length !== 2) return { ok: false, reason: 'malformed' };
  const [body, mac] = parts as [string, string];
  const expected = sign(body, secret);
  // Constant-time compare.
  if (
    mac.length !== expected.length ||
    !crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(expected))
  ) {
    return { ok: false, reason: 'bad_signature' };
  }
  let payload: RunPayload;
  try {
    payload = JSON.parse(b64urlDecode(body).toString('utf8')) as RunPayload;
  } catch {
    return { ok: false, reason: 'malformed' };
  }
  if (typeof payload.exp !== 'number' || payload.exp < now) return { ok: false, reason: 'expired' };
  return { ok: true, payload };
}

export function newNonce(): string {
  return b64url(crypto.randomBytes(16));
}

// Plausibility bounds for a submitted score given a run duration.
// Space Runner hits ~ SPEED_MAX * time; empirically < 20 points/second sustained.
export const SCORE_PER_SECOND_MAX = 40;
export const RUN_MAX_DURATION_MS = 30 * 60 * 1000; // 30 min hard cap

export function scoreIsPlausible(score: number, durationMs: number): boolean {
  if (!Number.isFinite(score) || !Number.isFinite(durationMs)) return false;
  if (score < 0 || durationMs < 0) return false;
  if (durationMs > RUN_MAX_DURATION_MS) return false;
  const seconds = durationMs / 1000;
  return score <= Math.ceil(seconds * SCORE_PER_SECOND_MAX) + 50; // +50 constant for combo bursts
}
