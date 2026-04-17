import crypto from 'node:crypto';

// Origin check for state-changing requests. Prevents trivial CSRF even where
// SameSite=Lax would allow (e.g., top-level POST via form submit).
export function isSameOrigin(req: Request, expectedOrigin: string): boolean {
  const origin = req.headers.get('origin');
  if (origin) return origin === expectedOrigin;
  // Some clients (native fetch from our own SPA) omit Origin; fall back to Referer.
  const referer = req.headers.get('referer');
  if (!referer) return false;
  try {
    return new URL(referer).origin === expectedOrigin;
  } catch {
    return false;
  }
}

export function generateCspNonce(): string {
  return crypto.randomBytes(16).toString('base64');
}

export function buildCsp(nonce: string): string {
  // Strict CSP:
  // - No inline scripts except those carrying our per-request nonce.
  // - No eval. No remote scripts (game uses unpkg for three.js — whitelisted below).
  // - frame-ancestors 'self' so we can embed our own /game iframe but nobody else can embed us.
  const directives = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' https://unpkg.com`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    "connect-src 'self' https://api.stripe.com",
    "frame-src 'self' https://js.stripe.com https://hooks.stripe.com",
    "frame-ancestors 'self'",
    "form-action 'self' https://checkout.stripe.com",
    "base-uri 'self'",
    "object-src 'none'",
    "upgrade-insecure-requests",
  ];
  return directives.join('; ');
}
