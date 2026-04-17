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

## Daily food-offers email (Vercel Cron)

A small scheduled job that emails a curated list of top-rated local restaurants
near a ZIP code each morning.

- Handler: `app/api/cron/food-offers/route.ts`
- Schedule: `vercel.json` — fires at 12:00 and 13:00 UTC; the handler only sends
  when the local hour in `DAILY_OFFERS_TZ` equals `DAILY_OFFERS_SEND_HOUR`, so
  8 AM America/New_York delivery works under both EDT and EST with no edits.
- Auth: `Authorization: Bearer $CRON_SECRET` (Vercel Cron injects this).
- Data: Yelp Fusion API if `YELP_API_KEY` is set; otherwise a small static
  fallback list so the first send still contains something.

Configure in your Vercel project env:

```
CRON_SECRET=...              # openssl rand -hex 32
DAILY_OFFERS_RECIPIENT=you@example.com
DAILY_OFFERS_ZIP=45103
DAILY_OFFERS_TZ=America/New_York
DAILY_OFFERS_SEND_HOUR=8
YELP_API_KEY=...             # optional but recommended
RESEND_API_KEY=...           # already required for magic-link auth
EMAIL_FROM="Offers <offers@example.com>"
```

Test locally:
```bash
curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/food-offers
```

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
