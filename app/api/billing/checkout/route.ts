import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { stripe, resolvePrice } from '@/lib/stripe';
import { db } from '@/lib/db';
import { env } from '@/lib/env';
import { limiters, clientIp } from '@/lib/ratelimit';
import { logger } from '@/lib/logger';
import { isSameOrigin } from '@/lib/security';
import { CheckoutBody } from '@/lib/validation';

export async function POST(req: Request) {
  // --- CSRF / origin guard ---
  if (!isSameOrigin(req, env.NEXTAUTH_URL)) {
    return NextResponse.json({ error: 'bad origin' }, { status: 403 });
  }

  // --- Authn ---
  const session = await auth();
  if (!session?.user?.id || !session.user.email) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  // --- Rate limit ---
  const rl = await limiters.api.limit(`checkout:${session.user.id}`);
  if (!rl.success) {
    logger.warn({ userId: session.user.id, ip: clientIp(req) }, 'checkout rate limited');
    return NextResponse.json({ error: 'too many requests' }, { status: 429 });
  }

  // --- Input validation ---
  // Accept both form submit (pricing page) and JSON.
  const contentType = req.headers.get('content-type') ?? '';
  let rawPlan: unknown;
  if (contentType.includes('application/json')) {
    rawPlan = ((await req.json()) as { plan?: unknown }).plan;
  } else {
    const fd = await req.formData();
    rawPlan = fd.get('plan');
  }
  const parsed = CheckoutBody.safeParse({ plan: rawPlan });
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid plan' }, { status: 400 });
  }

  // --- Resolve price server-side — NEVER trust a client-sent price ID ---
  const priceId = resolvePrice(parsed.data.plan);

  // --- Ensure Stripe customer exists (one per user) ---
  const existing = await db.subscription.findUnique({ where: { userId: session.user.id } });
  let customerId = existing?.stripeCustomerId;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: session.user.email,
      metadata: { userId: session.user.id },
    });
    customerId = customer.id;
    // Placeholder subscription row so we always have a 1:1 mapping.
    await db.subscription.upsert({
      where: { userId: session.user.id },
      update: { stripeCustomerId: customerId },
      create: {
        userId: session.user.id,
        stripeCustomerId: customerId,
        status: 'INCOMPLETE',
      },
    });
  }

  const checkout = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${env.NEXTAUTH_URL}/dashboard?checkout=success`,
    cancel_url: `${env.NEXTAUTH_URL}/pricing?checkout=cancel`,
    allow_promotion_codes: true,
    billing_address_collection: 'auto',
    client_reference_id: session.user.id,
    subscription_data: { metadata: { userId: session.user.id } },
  });

  await db.auditLog.create({
    data: {
      userId: session.user.id,
      event: 'CHECKOUT_STARTED',
      ip: clientIp(req),
      meta: { plan: parsed.data.plan, sessionId: checkout.id },
    },
  });

  if (!checkout.url) {
    return NextResponse.json({ error: 'stripe error' }, { status: 502 });
  }
  return NextResponse.redirect(checkout.url, { status: 303 });
}
