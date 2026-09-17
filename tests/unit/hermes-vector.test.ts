import { describe, expect, it } from 'vitest';
import { canonicalString, signRequest, verifySignature } from '@/lib/hermes/crypto';

// ---------------------------------------------------------------------------
// Cross-language contract.
//
// The watch signs requests in Swift (hermes-watch/HermesKit/RequestSigner.swift)
// and this server verifies them in TypeScript. Nothing in CI compiles Swift, so
// the two implementations are pinned to one another by this fixed vector: the
// identical assertion lives in hermes-watch/HermesKitTests/RequestSignerTests.swift.
//
// If either side ever changes the canonical string — field order, separator,
// digest encoding — one of the two tests goes red instead of the watch silently
// failing to authenticate in the field.
// ---------------------------------------------------------------------------

export const VECTOR = {
  secret: 'test-device-secret-do-not-use',
  method: 'POST',
  path: '/api/hermes/capture',
  timestamp: 1_789_000_000_000,
  nonce: 'AAAAAAAAAAAAAAAAAAAAAA',
  body:
    '{"captures":[{"capturedAt":"2026-09-16T10:00:00.000Z","clientId":"11111111-2222-3333-4444-555555555555","source":"action_button","transcript":"remind me to call mom tomorrow at 4pm","utcOffsetMinutes":-420}]}',
  expectedBodyHash: 'c0c9b19ce8c54d12f999cff9d851adc6e03b7e9f30aa5baf5089dcb6c98fc856',
  expectedSignature: 'vZ-BybQV5pT7sF0nclC5woXMxFYY2wHGNcVb86hMri8',
} as const;

describe('signing vector shared with the watch client', () => {
  const input = {
    method: VECTOR.method,
    path: VECTOR.path,
    timestamp: VECTOR.timestamp,
    nonce: VECTOR.nonce,
    body: VECTOR.body,
  };

  it('produces the pinned canonical string', () => {
    expect(canonicalString(input)).toBe(
      [
        'HERMES-V1',
        'POST',
        '/api/hermes/capture',
        '1789000000000',
        VECTOR.nonce,
        VECTOR.expectedBodyHash,
      ].join('\n'),
    );
  });

  it('produces the pinned signature', () => {
    expect(signRequest(input, VECTOR.secret)).toBe(VECTOR.expectedSignature);
  });

  it('accepts the pinned signature end to end', () => {
    expect(verifySignature(input, VECTOR.secret, VECTOR.expectedSignature, VECTOR.timestamp).ok).toBe(true);
  });
});
