import { z } from 'zod';

// Centralized request schemas. Every API route parses with these — never trust
// untyped JSON from the client.

export const CheckoutBody = z.object({
  plan: z.enum(['pro_monthly', 'pro_yearly']),
});

export const ScoreBody = z.object({
  runToken: z.string().min(20).max(2048),
  value: z.number().int().min(0).max(10_000_000),
  durationMs: z.number().int().min(0).max(30 * 60 * 1000),
});

export const LeaderboardQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  cursor: z.string().optional(),
});
