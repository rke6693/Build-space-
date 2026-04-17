import { describe, it, expect } from 'vitest';
import { issueRunToken, verifyRunToken, scoreIsPlausible, newNonce } from '../../lib/runtoken';

const SECRET = 'a'.repeat(48);

describe('runtoken', () => {
  const payload = {
    runId: 'run_1',
    userId: 'user_1',
    nonce: newNonce(),
    iat: Date.now(),
    exp: Date.now() + 60_000,
  };

  it('round-trips a valid token', () => {
    const tok = issueRunToken(payload, SECRET);
    const r = verifyRunToken(tok, SECRET);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.payload).toEqual(payload);
  });

  it('rejects tampered payload', () => {
    const tok = issueRunToken(payload, SECRET);
    const [body, mac] = tok.split('.') as [string, string];
    // Flip a bit in the payload.
    const tampered = body.slice(0, -1) + (body.slice(-1) === 'A' ? 'B' : 'A') + '.' + mac;
    const r = verifyRunToken(tampered, SECRET);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('bad_signature');
  });

  it('rejects wrong secret', () => {
    const tok = issueRunToken(payload, SECRET);
    const r = verifyRunToken(tok, 'b'.repeat(48));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('bad_signature');
  });

  it('rejects expired token', () => {
    const tok = issueRunToken({ ...payload, exp: Date.now() - 1 }, SECRET);
    const r = verifyRunToken(tok, SECRET);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('expired');
  });

  it('rejects malformed token', () => {
    expect(verifyRunToken('not-a-token', SECRET).ok).toBe(false);
    expect(verifyRunToken('a.b.c', SECRET).ok).toBe(false);
  });
});

describe('scoreIsPlausible', () => {
  it('accepts reasonable scores', () => {
    expect(scoreIsPlausible(100, 10_000)).toBe(true);   // 10 pts/sec, 10s
    expect(scoreIsPlausible(2000, 60_000)).toBe(true);  // ~33 pts/sec, 60s
  });

  it('rejects negative inputs', () => {
    expect(scoreIsPlausible(-1, 1000)).toBe(false);
    expect(scoreIsPlausible(100, -1)).toBe(false);
  });

  it('rejects non-finite', () => {
    expect(scoreIsPlausible(Infinity, 1000)).toBe(false);
    expect(scoreIsPlausible(NaN, 1000)).toBe(false);
  });

  it('rejects superhuman rates', () => {
    expect(scoreIsPlausible(1_000_000, 1000)).toBe(false); // 1M pts in 1s
  });

  it('rejects impossible durations', () => {
    expect(scoreIsPlausible(10, 24 * 60 * 60 * 1000)).toBe(false); // 24h
  });
});
