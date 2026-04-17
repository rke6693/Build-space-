import { describe, it, expect } from 'vitest';
import { isSameOrigin, buildCsp, generateCspNonce } from '../../lib/security';

function req(headers: Record<string, string>): Request {
  return new Request('https://app.example.com/x', { headers });
}

describe('isSameOrigin', () => {
  const expected = 'https://app.example.com';

  it('accepts matching Origin', () => {
    expect(isSameOrigin(req({ origin: expected }), expected)).toBe(true);
  });
  it('rejects mismatched Origin (CSRF)', () => {
    expect(isSameOrigin(req({ origin: 'https://evil.com' }), expected)).toBe(false);
  });
  it('falls back to Referer when Origin absent', () => {
    expect(isSameOrigin(req({ referer: `${expected}/page` }), expected)).toBe(true);
    expect(isSameOrigin(req({ referer: 'https://evil.com/page' }), expected)).toBe(false);
  });
  it('rejects when neither header is present', () => {
    expect(isSameOrigin(req({}), expected)).toBe(false);
  });
  it('tolerates malformed referer', () => {
    expect(isSameOrigin(req({ referer: 'not-a-url' }), expected)).toBe(false);
  });
});

describe('CSP', () => {
  it('includes the per-request nonce and blocks object/base', () => {
    const nonce = generateCspNonce();
    const csp = buildCsp(nonce);
    expect(csp).toContain(`'nonce-${nonce}'`);
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("frame-ancestors 'self'");
    // No inline script allowance.
    expect(csp).not.toContain("'unsafe-inline' 'nonce");
  });
  it('generates distinct nonces', () => {
    expect(generateCspNonce()).not.toBe(generateCspNonce());
  });
});
