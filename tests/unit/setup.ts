// Stub env so modules that import lib/env can be loaded in unit tests.
// Mirrors the values used by .github/workflows/ci.yml.
process.env.NEXTAUTH_URL ??= 'http://localhost:3000';
process.env.AUTH_SECRET ??= 'test-secret-test-secret-test-secret';
process.env.DATABASE_URL ??= 'postgresql://user:pw@localhost/db';
process.env.STRIPE_SECRET_KEY ??= 'sk_test_stub';
process.env.STRIPE_WEBHOOK_SECRET ??= 'whsec_stub';
process.env.STRIPE_PRICE_PRO_MONTHLY ??= 'price_stub';
process.env.RUN_TOKEN_SECRET ??= 'test-run-token-secret-at-least-32-bytes-long';
