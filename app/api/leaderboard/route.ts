import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { limiters, clientIp } from '@/lib/ratelimit';
import { LeaderboardQuery } from '@/lib/validation';

export const revalidate = 30;

export async function GET(req: Request) {
  // Unauthed endpoint; rate-limit per IP.
  const rl = await limiters.leaderboard.limit(`lb:${clientIp(req)}`);
  if (!rl.success) return NextResponse.json({ error: 'too many requests' }, { status: 429 });

  const url = new URL(req.url);
  const parsed = LeaderboardQuery.safeParse({
    limit: url.searchParams.get('limit') ?? undefined,
    cursor: url.searchParams.get('cursor') ?? undefined,
  });
  if (!parsed.success) return NextResponse.json({ error: 'bad query' }, { status: 400 });

  const rows = await db.score.findMany({
    orderBy: { value: 'desc' },
    take: parsed.data.limit,
    ...(parsed.data.cursor ? { cursor: { id: parsed.data.cursor }, skip: 1 } : {}),
    select: {
      id: true,
      value: true,
      createdAt: true,
      user: { select: { name: true, email: true } },
    },
  });

  // Redact email: show only a 3-char prefix.
  const safe = rows.map((r) => ({
    id: r.id,
    value: r.value,
    createdAt: r.createdAt,
    player:
      r.user.name ??
      (r.user.email ? `${(r.user.email.split('@')[0] ?? '').slice(0, 3)}***` : 'anonymous'),
  }));

  return NextResponse.json({ rows: safe, nextCursor: rows.at(-1)?.id ?? null });
}
