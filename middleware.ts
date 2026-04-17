import { NextRequest, NextResponse } from 'next/server';
import { generateCspNonce, buildCsp } from './lib/security';

// Edge middleware runs on every request. We do three things here:
//   1. Issue a per-request CSP nonce and attach it via response header.
//   2. Send security headers that must vary per-response (CSP with nonce).
//   3. Gate /dashboard and /play to authenticated sessions via cookie presence.
//
// NOTE: Full session validation happens server-side in route handlers. The
// cookie check here is a cheap fast-path to redirect unauthenticated users.

const PROTECTED_PREFIXES = ['/dashboard', '/play', '/api/scores', '/api/billing/checkout', '/api/billing/portal', '/api/run'];

function isProtected(pathname: string): boolean {
  return PROTECTED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

function hasSessionCookie(req: NextRequest): boolean {
  // Auth.js v5 uses __Secure-authjs.session-token in production and authjs.session-token in dev.
  return (
    req.cookies.has('authjs.session-token') ||
    req.cookies.has('__Secure-authjs.session-token')
  );
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Gate protected paths.
  if (isProtected(pathname) && !hasSessionCookie(req)) {
    if (pathname.startsWith('/api/')) {
      return new NextResponse(JSON.stringify({ error: 'unauthorized' }), {
        status: 401,
        headers: { 'content-type': 'application/json' },
      });
    }
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  }

  // CSP with per-request nonce.
  const nonce = generateCspNonce();
  const csp = buildCsp(nonce);

  const requestHeaders = new Headers(req.headers);
  requestHeaders.set('x-csp-nonce', nonce);

  const res = NextResponse.next({ request: { headers: requestHeaders } });
  // Skip CSP on the /game iframe path — it ships its own CSP in next.config.mjs
  // because the game bundle uses inline scripts we do not want to rewrite.
  if (!pathname.startsWith('/game')) {
    res.headers.set('Content-Security-Policy', csp);
  }
  res.headers.set('x-csp-nonce', nonce);
  return res;
}

export const config = {
  // Skip static assets and the Next internals.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)'],
};
