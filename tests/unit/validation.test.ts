import { describe, it, expect } from 'vitest';
import { CheckoutBody, ScoreBody, LeaderboardQuery } from '../../lib/validation';

describe('CheckoutBody', () => {
  it('accepts allowlisted plans', () => {
    expect(CheckoutBody.safeParse({ plan: 'pro_monthly' }).success).toBe(true);
    expect(CheckoutBody.safeParse({ plan: 'pro_yearly' }).success).toBe(true);
  });
  it('rejects unknown plans (prevents price-ID injection)', () => {
    expect(CheckoutBody.safeParse({ plan: 'enterprise' }).success).toBe(false);
    expect(CheckoutBody.safeParse({ plan: 'price_ATTACKER' }).success).toBe(false);
    expect(CheckoutBody.safeParse({}).success).toBe(false);
  });
});

describe('ScoreBody', () => {
  it('requires all fields', () => {
    expect(ScoreBody.safeParse({}).success).toBe(false);
    expect(ScoreBody.safeParse({ runToken: 'x'.repeat(40), value: 10 }).success).toBe(false);
  });
  it('bounds numeric fields', () => {
    const token = 'x'.repeat(40);
    expect(ScoreBody.safeParse({ runToken: token, value: -1, durationMs: 1000 }).success).toBe(false);
    expect(ScoreBody.safeParse({ runToken: token, value: 10, durationMs: -1 }).success).toBe(false);
    expect(ScoreBody.safeParse({ runToken: token, value: 10_000_001, durationMs: 1000 }).success).toBe(false);
    expect(ScoreBody.safeParse({ runToken: token, value: 10, durationMs: 60 * 60 * 1000 }).success).toBe(false);
  });
  it('accepts valid body', () => {
    const r = ScoreBody.safeParse({ runToken: 'x'.repeat(40), value: 1234, durationMs: 60_000 });
    expect(r.success).toBe(true);
  });
  it('rejects fractional scores (integer-only)', () => {
    expect(ScoreBody.safeParse({ runToken: 'x'.repeat(40), value: 1.5, durationMs: 1000 }).success).toBe(false);
  });
});

describe('LeaderboardQuery', () => {
  it('defaults limit to 25', () => {
    const r = LeaderboardQuery.safeParse({});
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.limit).toBe(25);
  });
  it('caps limit at 100', () => {
    expect(LeaderboardQuery.safeParse({ limit: '9999' }).success).toBe(false);
  });
  it('coerces strings to numbers', () => {
    const r = LeaderboardQuery.safeParse({ limit: '50' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.limit).toBe(50);
  });
});
