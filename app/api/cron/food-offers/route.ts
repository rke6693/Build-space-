// Daily food-offers email. Triggered by Vercel Cron (see vercel.json).
//
// Vercel fires at 12:00 and 13:00 UTC so we cover 8am in America/New_York
// across both EDT and EST. This handler only sends the email when the local
// hour in DAILY_OFFERS_TZ matches DAILY_OFFERS_SEND_HOUR — the "other"
// invocation is a cheap no-op. That keeps DST handling implicit and schedule
// edits unnecessary.

import { NextResponse } from 'next/server';
import { env } from '@/lib/env';
import { logger } from '@/lib/logger';
import { fetchOffers } from '@/lib/food-offers';
import { sendOffersEmail } from '@/lib/email';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function localHour(tz: string, d = new Date()): number {
  const hourStr = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour: 'numeric',
    hour12: false,
  }).format(d);
  // Intl can emit "24" for midnight in some locales; normalize.
  const h = Number.parseInt(hourStr, 10);
  return h === 24 ? 0 : h;
}

function localDateLabel(tz: string, d = new Date()): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  }).format(d);
}

function authorized(req: Request): boolean {
  // Vercel Cron includes this header on every scheduled invocation when
  // CRON_SECRET is configured in the project. We reject anything else so the
  // endpoint can't be hit by the public internet.
  if (!env.CRON_SECRET) return false;
  const header = req.headers.get('authorization');
  return header === `Bearer ${env.CRON_SECRET}`;
}

export async function GET(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  if (!env.DAILY_OFFERS_RECIPIENT) {
    logger.warn('DAILY_OFFERS_RECIPIENT not set — skipping daily offers email');
    return NextResponse.json({ skipped: 'no recipient configured' });
  }

  const now = new Date();
  const hour = localHour(env.DAILY_OFFERS_TZ, now);
  if (hour !== env.DAILY_OFFERS_SEND_HOUR) {
    return NextResponse.json({
      skipped: 'not send hour',
      localHour: hour,
      sendHour: env.DAILY_OFFERS_SEND_HOUR,
      tz: env.DAILY_OFFERS_TZ,
    });
  }

  const zip = env.DAILY_OFFERS_ZIP;
  const offers = await fetchOffers(zip, 6);
  const dateLabel = localDateLabel(env.DAILY_OFFERS_TZ, now);

  const { id } = await sendOffersEmail({
    to: env.DAILY_OFFERS_RECIPIENT,
    zip,
    dateLabel,
    offers,
  });

  logger.info({ count: offers.length, messageId: id, zip }, 'daily offers email sent');
  return NextResponse.json({ sent: true, count: offers.length, messageId: id });
}
