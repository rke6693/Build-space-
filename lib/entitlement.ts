import { db } from './db';

// Single source of truth for "is this user Pro?"
// NEVER check entitlement on the client.
export async function hasProEntitlement(userId: string): Promise<boolean> {
  const sub = await db.subscription.findUnique({
    where: { userId },
    select: { status: true, currentPeriodEnd: true },
  });
  if (!sub) return false;
  if (sub.status !== 'ACTIVE' && sub.status !== 'TRIALING') return false;
  if (sub.currentPeriodEnd && sub.currentPeriodEnd.getTime() < Date.now()) return false;
  return true;
}

export const FREE_DAILY_RUN_LIMIT = 3;

export async function freeRunsRemainingToday(userId: string, now = new Date()): Promise<number> {
  const startOfDay = new Date(now);
  startOfDay.setUTCHours(0, 0, 0, 0);
  const used = await db.run.count({
    where: { userId, startedAt: { gte: startOfDay } },
  });
  return Math.max(0, FREE_DAILY_RUN_LIMIT - used);
}
