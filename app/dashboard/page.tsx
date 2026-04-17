import Link from 'next/link';
import { auth, signOut } from '@/lib/auth';
import { hasProEntitlement, freeRunsRemainingToday } from '@/lib/entitlement';
import { db } from '@/lib/db';

export default async function Dashboard() {
  const session = await auth();
  if (!session?.user?.id) {
    return (
      <main className="container">
        <p>Not signed in.</p>
      </main>
    );
  }
  const userId = session.user.id;
  const [isPro, remaining, bestScore] = await Promise.all([
    hasProEntitlement(userId),
    freeRunsRemainingToday(userId),
    db.score.findFirst({
      where: { userId },
      orderBy: { value: 'desc' },
      select: { value: true, createdAt: true },
    }),
  ]);

  return (
    <main className="container">
      <nav style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 32 }}>
        <strong>Space Runner</strong>
        <form action={async () => { 'use server'; await signOut({ redirectTo: '/' }); }}>
          <button type="submit" className="btn secondary">Sign out</button>
        </form>
      </nav>
      <h1>Welcome back</h1>
      <div className="row" style={{ marginTop: 24 }}>
        <div className="card" style={{ flex: 1, minWidth: 240 }}>
          <strong>Plan</strong>
          <p style={{ color: '#fff', fontSize: 24, marginTop: 8 }}>{isPro ? 'Pro' : 'Free'}</p>
          {isPro ? (
            <form action="/api/billing/portal" method="post" style={{ marginTop: 12 }}>
              <button type="submit" className="btn secondary">Manage billing</button>
            </form>
          ) : (
            <Link href="/pricing" className="btn" style={{ marginTop: 12, display: 'inline-block' }}>
              Upgrade
            </Link>
          )}
        </div>
        <div className="card" style={{ flex: 1, minWidth: 240 }}>
          <strong>Today</strong>
          <p style={{ color: '#fff', fontSize: 24, marginTop: 8 }}>
            {isPro ? 'Unlimited' : `${remaining} run${remaining === 1 ? '' : 's'} left`}
          </p>
        </div>
        <div className="card" style={{ flex: 1, minWidth: 240 }}>
          <strong>Best score</strong>
          <p style={{ color: '#fff', fontSize: 24, marginTop: 8 }}>{bestScore?.value ?? 0}</p>
        </div>
      </div>
      <div className="row" style={{ marginTop: 24 }}>
        <Link href="/play" className="btn">Play</Link>
        <Link href="/leaderboard" className="btn secondary">Leaderboard</Link>
      </div>
    </main>
  );
}
