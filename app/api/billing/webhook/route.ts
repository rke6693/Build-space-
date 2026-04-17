import { NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { stripe } from '@/lib/stripe';
import { db } from '@/lib/db';
import { env } from '@/lib/env';
import { logger } from '@/lib/logger';
import { limiters, clientIp } from '@/lib/ratelimit';

// Webhook must receive the raw body to verify Stripe's signature.
// NEVER parse JSON before verification.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function mapStatus(s: Stripe.Subscription.Status) {
  switch (s) {
    case 'active':
      return 'ACTIVE' as const;
    case 'trialing':
      return 'TRIALING' as const;
    case 'past_due':
      return 'PAST_DUE' as const;
    case 'canceled':
      return 'CANCELED' as const;
    case 'incomplete':
      return 'INCOMPLETE' as const;
    case 'incomplete_expired':
      return 'INCOMPLETE_EXPIRED' as const;
    case 'unpaid':
      return 'UNPAID' as const;
    case 'paused':
      return 'PAUSED' as const;
    default:
      return 'INCOMPLETE' as const;
  }
}

export async function POST(req: Request) {
  // Flood guard (signature verification is CPU-bound). Source IP since no user context.
  const rl = await limiters.webhook.limit(`wh:${clientIp(req)}`);
  if (!rl.success) return new NextResponse('rate limited', { status: 429 });

  const sig = req.headers.get('stripe-signature');
  if (!sig) return new NextResponse('missing signature', { status: 400 });

  const raw = await req.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(raw, sig, env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    await db.auditLog.create({
      data: {
        event: 'WEBHOOK_REJECTED',
        ip: clientIp(req),
        meta: { reason: 'bad signature', msg: err instanceof Error ? err.message : String(err) },
      },
    });
    return new NextResponse('bad signature', { status: 400 });
  }

  // Dedupe — unique insert of the event ID. If this throws on unique violation
  // we've already processed this event; return 200 to prevent Stripe retries.
  try {
    await db.webhookEvent.create({ data: { id: event.id, type: event.type } });
  } catch {
    return NextResponse.json({ received: true, duplicate: true });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const s = event.data.object as Stripe.Checkout.Session;
        const userId = s.client_reference_id ?? s.metadata?.userId;
        if (userId && typeof s.customer === 'string') {
          await db.subscription.upsert({
            where: { userId },
            update: {
              stripeCustomerId: s.customer,
              stripeSubscriptionId: typeof s.subscription === 'string' ? s.subscription : null,
            },
            create: {
              userId,
              stripeCustomerId: s.customer,
              stripeSubscriptionId: typeof s.subscription === 'string' ? s.subscription : null,
              status: 'INCOMPLETE',
            },
          });
        }
        break;
      }
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription;
        const userId = (sub.metadata?.userId ?? '') || null;
        const customer = typeof sub.customer === 'string' ? sub.customer : sub.customer.id;
        const where = userId ? { userId } : { stripeCustomerId: customer };
        await db.subscription.update({
          where,
          data: {
            stripeSubscriptionId: sub.id,
            stripePriceId: sub.items.data[0]?.price.id,
            status: mapStatus(sub.status),
            currentPeriodEnd: new Date(sub.current_period_end * 1000),
            cancelAtPeriodEnd: sub.cancel_at_period_end,
          },
        });
        await db.auditLog.create({
          data: {
            userId: userId ?? undefined,
            event: event.type === 'customer.subscription.deleted' ? 'SUBSCRIPTION_CANCELED' : 'SUBSCRIPTION_UPDATED',
            meta: { subscriptionId: sub.id, status: sub.status },
          },
        });
        break;
      }
      default:
        // Ignore unhandled event types explicitly — don't fail the webhook.
        logger.debug({ type: event.type }, 'unhandled stripe event');
    }
  } catch (err) {
    logger.error({ err, eventId: event.id }, 'webhook handler failed');
    // Return 500 so Stripe retries. Remove the dedupe row so retry can succeed.
    await db.webhookEvent.delete({ where: { id: event.id } }).catch(() => {});
    return new NextResponse('handler error', { status: 500 });
  }

  return NextResponse.json({ received: true });
}
