import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { env } from '@/lib/env';
import { hasProEntitlement, freeRunsRemainingToday } from '@/lib/entitlement';
import { limiters, clientIp } from '@/lib/ratelimit';
import { issueRunToken, newNonce } from '@/lib/runtoken';
import { isSameOrigin } from '@/lib/security';

const RUN_TTL_MS = 20 * 60 * 1000; // 20 min to finish a run

export async function POST(req: Request) {
  if (!isSameOrigin(req, env.NEXTAUTH_URL)) {
    return NextResponse.json({ ok: false, error: 'bad origin' }, { status: 403 });
  }
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }
  const userId = session.user.id;

  const rl = await limiters.api.limit(`run:${userId}`);
  if (!rl.success) {
    return NextResponse.json({ ok: false, error: 'too many requests' }, { status: 429 });
  }

  // Entitlement check.
  const isPro = await hasProEntitlement(userId);
  if (!isPro) {
    const remaining = await freeRunsRemainingToday(userId);
    if (remaining <= 0) {
      return NextResponse.json({ ok: false, error: 'daily run limit reached' }, { status: 402 });
    }
  }

  const nonce = newNonce();
  const now = Date.now();
  const expiresAt = new Date(now + RUN_TTL_MS);

  const run = await db.run.create({
    data: { userId, nonce, expiresAt },
    select: { id: true },
  });

  const token = issueRunToken(
    { runId: run.id, userId, nonce, iat: now, exp: expiresAt.getTime() },
    env.RUN_TOKEN_SECRET,
  );

  await db.auditLog.create({
    data: { userId, event: 'LOGIN', ip: clientIp(req), meta: { runId: run.id } },
  }).catch(() => {}); // audit writes should never fail the request

  return NextResponse.json({ ok: true, runId: run.id, runToken: token });
}
