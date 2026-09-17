import { describe, expect, it } from 'vitest';
import {
  canonicalString,
  hashPairingCode,
  newDeviceSecret,
  newPairingCode,
  normalizePairingCode,
  openSecret,
  sealSecret,
  signRequest,
  verifySignature,
} from '@/lib/hermes/crypto';

const AUTH_SECRET = 'test-auth-secret-at-least-32-bytes-long!!';

describe('device secret sealing', () => {
  it('round-trips a secret', () => {
    const secret = newDeviceSecret();
    const sealed = sealSecret(secret, AUTH_SECRET);
    expect(sealed).not.toContain(secret);
    expect(openSecret(sealed, AUTH_SECRET)).toBe(secret);
  });

  it('is non-deterministic (fresh IV per seal)', () => {
    const secret = newDeviceSecret();
    expect(sealSecret(secret, AUTH_SECRET)).not.toBe(sealSecret(secret, AUTH_SECRET));
  });

  it('refuses to open under a rotated AUTH_SECRET', () => {
    const sealed = sealSecret(newDeviceSecret(), AUTH_SECRET);
    expect(openSecret(sealed, 'a-different-secret-also-32-bytes-long!!')).toBeNull();
  });

  it('rejects a tampered ciphertext instead of returning garbage', () => {
    const sealed = sealSecret('hello', AUTH_SECRET);
    const parts = sealed.split('.');
    parts[3] = `${parts[3]!.slice(0, -2)}AA`;
    expect(openSecret(parts.join('.'), AUTH_SECRET)).toBeNull();
    expect(openSecret('garbage', AUTH_SECRET)).toBeNull();
  });
});

describe('request signing', () => {
  const secret = 'device-secret';
  const base = {
    method: 'POST',
    path: '/api/hermes/capture',
    timestamp: 1_700_000_000_000,
    nonce: 'nonce-123456',
    body: '{"transcript":"remind me to call mom"}',
  };

  it('verifies a well-formed signature', () => {
    const sig = signRequest(base, secret);
    expect(verifySignature(base, secret, sig, base.timestamp).ok).toBe(true);
  });

  it('binds the body: a tampered payload fails', () => {
    const sig = signRequest(base, secret);
    const tampered = { ...base, body: '{"transcript":"wire $500 to attacker"}' };
    const v = verifySignature(tampered, secret, sig, base.timestamp);
    expect(v).toEqual({ ok: false, reason: 'bad_signature' });
  });

  it('binds the path: a capture signature cannot be replayed at another route', () => {
    const sig = signRequest(base, secret);
    const moved = { ...base, path: '/api/hermes/device' };
    expect(verifySignature(moved, secret, sig, base.timestamp).ok).toBe(false);
  });

  it('binds the method', () => {
    const sig = signRequest(base, secret);
    expect(verifySignature({ ...base, method: 'DELETE' }, secret, sig, base.timestamp).ok).toBe(false);
  });

  it('rejects another device’s secret', () => {
    const sig = signRequest(base, 'someone-elses-secret');
    expect(verifySignature(base, secret, sig, base.timestamp).ok).toBe(false);
  });

  it('rejects a stale timestamp in either direction', () => {
    const sig = signRequest(base, secret);
    expect(verifySignature(base, secret, sig, base.timestamp + 6 * 60_000)).toEqual({
      ok: false,
      reason: 'stale_timestamp',
    });
    expect(verifySignature(base, secret, sig, base.timestamp - 6 * 60_000)).toEqual({
      ok: false,
      reason: 'stale_timestamp',
    });
  });

  it('rejects malformed input without throwing', () => {
    expect(verifySignature({ ...base, nonce: '' }, secret, 'x', base.timestamp).ok).toBe(false);
    expect(verifySignature(base, secret, '', base.timestamp).ok).toBe(false);
    expect(verifySignature({ ...base, timestamp: Number.NaN }, secret, 'x').ok).toBe(false);
  });

  it('produces a canonical string containing every bound field', () => {
    const canonical = canonicalString(base);
    expect(canonical.split('\n')).toHaveLength(6);
    expect(canonical).toContain('HERMES-V1');
    expect(canonical).toContain('/api/hermes/capture');
    expect(canonical).toContain(base.nonce);
    // The body appears only as a digest, never verbatim.
    expect(canonical).not.toContain('call mom');
  });
});

describe('pairing codes', () => {
  it('generates a readable 4-4 code with no ambiguous characters', () => {
    for (let i = 0; i < 50; i++) {
      const code = newPairingCode();
      expect(code).toMatch(/^[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/);
      expect(code).not.toMatch(/[ILOU]/);
    }
  });

  it('normalizes sloppy typing to the same hash', () => {
    const code = newPairingCode();
    const sloppy = code.toLowerCase().replace('-', ' ');
    expect(normalizePairingCode(sloppy)).toBe(code);
    expect(hashPairingCode(sloppy)).toBe(hashPairingCode(code));
  });

  it('hashes, so the plaintext code is not recoverable from storage', () => {
    const code = newPairingCode();
    const hash = hashPairingCode(code);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toContain(code.replace('-', ''));
  });
});
