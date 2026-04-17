# Space Runner — monetized 3D runner

A Next.js 14 micro-SaaS built around the `public/game/index.html` endless runner.
Free tier with 3 runs/day; **Pro ($4.99/mo)** removes the limit and unlocks the
global leaderboard.

## Stack

- **Next.js 14** (App Router, TypeScript) on Vercel
- **Postgres** (Neon) via **Prisma**
- **Auth.js v5**: magic-link email (Resend) + Google OAuth
- **Stripe** Checkout + Customer Portal + signed webhooks
- **Upstash Redis** for rate limiting (falls back to in-memory in dev)
- **Vitest** for unit tests; **Playwright** for E2E

## Security posture (baked in, not bolted on)

| Surface | Control |
|---|---|
| Auth | Magic-link only in v1 (no password storage); rotating DB sessions; HttpOnly+Secure+SameSite cookies |
| Login throttling | Per-IP+email sliding window (Upstash); in-memory fallback |
| API | Every route zod-validated; every query owner-scoped (no IDOR); origin check on state-changing routes |
| Anti-cheat | Server-issued run tokens (HMAC-SHA256), single-use, TTL, plausibility bounds |
| Billing | Price IDs server-resolved from allowlist; webhook signature + event-ID dedupe |
| Web | Strict CSP with per-request nonce; HSTS; frame-ancestors `'self'`; redacted logs |
| Data | Emails redacted on public leaderboard; audit log for auth + billing events |

## Getting started

```bash
cp .env.example .env.local
# fill in real values for AUTH_SECRET, DATABASE_URL, STRIPE_*, RUN_TOKEN_SECRET
npm install
npx prisma migrate dev
npm run dev
```

Stripe webhook for local dev:
```bash
stripe listen --forward-to localhost:3000/api/billing/webhook
```

## Scripts

- `npm run dev` — dev server
- `npm run build` — prod build
- `npm test` — unit tests
- `npm run e2e` — Playwright
- `npm run typecheck` — TypeScript check
- `npm run db:migrate` — Prisma migrations

## Layout

```
app/
  page.tsx, pricing/, login/, dashboard/, leaderboard/, play/
  api/
    auth/[...nextauth]/         # Auth.js
    billing/{checkout,portal,webhook}/
    run/start/                  # issues HMAC run token
    scores/                     # verifies token + plausibility
    leaderboard/
lib/
  auth, db, env, stripe, entitlement, ratelimit, runtoken, security, validation, logger
public/game/index.html          # the actual 3D game, served in a sandboxed iframe
prisma/schema.prisma
middleware.ts                   # CSP nonce, auth gate
tests/unit/                     # runtoken, validation, security
```
