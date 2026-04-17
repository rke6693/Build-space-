import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { env } from '@/lib/env';
import { limiters, clientIp } from '@/lib/ratelimit';
import { verifyRunToken, scoreIsPlausible } from '@/lib/runtoken';
import { isSameOrigin } from '@/lib/security';
import { ScoreBody } from '@/lib/validation';
import { logger } from '@/lib/logger';

export async function POST(req: Request) {
  if (!isSameOrigin(req, env.NEXTAUTH_URL)) {
    return NextResponse.json({ error: 'bad origin' }, { status: 403 });
  }
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const userId = session.user.id;

  const rl = await limiters.score.limit(`score:${userId}`);
  if (!rl.success) return NextResponse.json({ error: 'too many requests' }, { status: 429 });

  // Content-Type must be JSON — guards against CSRF via form posts and typos.
  if (!req.headers.get('content-type')?.includes('application/json')) {
    return NextResponse.json({ error: 'bad content type' }, { status: 415 });
  }

  const raw = (await req.json().catch(() => null)) as unknown;
  const parsed = ScoreBody.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 });
  }
  const { runToken, value, durationMs } = parsed.data;

  // --- HMAC verification ---
  const v = verifyRunToken(runToken, env.RUN_TOKEN_SECRET);
  if (!v.ok) {
    await auditReject(userId, clientIp(req), `token_${v.reason}`);
    return NextResponse.json({ error: 'invalid run token' }, { status: 400 });
  }
  // --- Ownership: token userId must match the session ---
  if (v.payload.userId !== userId) {
    await auditReject(userId, clientIp(req), 'user_mismatch');
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  // --- Plausibility ---
  if (!scoreIsPlausible(value, durationMs)) {
    await auditReject(userId, clientIp(req), 'implausible', { value, durationMs });
    return NextResponse.json({ error: 'implausible score' }, { status: 422 });
  }

  // --- Single-use consumption: update the Run row transactionally ---
  // Only mark a Run consumed if it belongs to this user, has this nonce, is not expired,
  // and has not already been consumed. `updateMany` returns 0 if the row was already claimed.
  const consumed = await db.run.updateMany({
    where: {
      id: v.payload.runId,
      userId,
      nonce: v.payload.nonce,
      consumedAt: null,
      expiresAt: { gt: new Date() },
    },
    data: { consumedAt: new Date() },
  });
  if (consumed.count === 0) {
    await auditReject(userId, clientIp(req), 'token_consumed_or_expired');
    return NextResponse.json({ error: 'run token already used or expired' }, { status: 409 });
  }

  const score = await db.score.create({
    data: { userId, runId: v.payload.runId, value, durationMs },
    select: { id: true, value: true },
  });

  return NextResponse.json({ ok: true, id: score.id, value: score.value });
}

async function auditReject(userId: string, ip: string, reason: string, meta: Record<string, unknown> = {}) {
  logger.warn({ userId, ip, reason, ...meta }, 'score rejected');
  await db.auditLog
    .create({ data: { userId, event: 'SCORE_REJECTED', ip, meta: { reason, ...meta } } })
    .catch(() => {});
}
