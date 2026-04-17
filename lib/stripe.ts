import Stripe from 'stripe';
import { env } from './env';

export const stripe = new Stripe(env.STRIPE_SECRET_KEY, {
  apiVersion: '2024-11-20.acacia',
  typescript: true,
});

// Server-side allowlist for price IDs. NEVER trust a price ID from the client —
// always resolve by plan name and look up the current ID here.
export const PRICE_ALLOWLIST: Record<'pro_monthly' | 'pro_yearly', string | undefined> = {
  pro_monthly: env.STRIPE_PRICE_PRO_MONTHLY,
  pro_yearly: env.STRIPE_PRICE_PRO_YEARLY,
};

export function resolvePrice(plan: keyof typeof PRICE_ALLOWLIST): string {
  const priceId = PRICE_ALLOWLIST[plan];
  if (!priceId) throw new Error(`Price not configured for plan: ${plan}`);
  return priceId;
}
