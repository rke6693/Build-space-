# Tests

- `tests/unit/**` — fast, no network, no DB. Run with `npm test`.
- `tests/e2e/**` — Playwright against a running dev server. Run with `npm run e2e`.

The unit tests cover the security-critical primitives:
- HMAC run-token round-trip, tamper, expiry (anti-cheat)
- Zod request schemas (price-ID allowlist, score bounds)
- CSRF origin check and CSP builder
