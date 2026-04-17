import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { stripe } from '@/lib/stripe';
import { db } from '@/lib/db';
import { env } from '@/lib/env';
import { limiters } from '@/lib/ratelimit';
import { isSameOrigin } from '@/lib/security';

export async function POST(req: Request) {
  if (!isSameOrigin(req, env.NEXTAUTH_URL)) {
    return NextResponse.json({ error: 'bad origin' }, { status: 403 });
  }
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const rl = await limiters.api.limit(`portal:${session.user.id}`);
  if (!rl.success) return NextResponse.json({ error: 'too many requests' }, { status: 429 });

  const sub = await db.subscription.findUnique({ where: { userId: session.user.id } });
  if (!sub?.stripeCustomerId) {
    return NextResponse.json({ error: 'no subscription' }, { status: 400 });
  }

  const portal = await stripe.billingPortal.sessions.create({
    customer: sub.stripeCustomerId,
    return_url: `${env.NEXTAUTH_URL}/dashboard`,
  });
  return NextResponse.redirect(portal.url, { status: 303 });
}
