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

## Hermes voice relay (Apple Watch)

Press the Action button on an Apple Watch Ultra 2, speak, and what you said
reaches your Hermes agent as a structured action — a reminder with a due date, a
line on a list, a note. The watch transcribes on-device and signs the payload;
the relay interprets it and fans it out to Telegram, SMS, a webhook, or email.

- Watch and iPhone app: [`hermes-watch/`](hermes-watch/) (watchOS 11+, XcodeGen)
- Pairing and delivery log: `/hermes`
- Configuration: see *Hermes voice relay* in `.env.example` — every var is
  optional, and captures still work with none of them set.

Security: device secrets are exchanged once at pairing and sealed at rest with
AES-256-GCM; every request is HMAC-signed over method, path, timestamp, nonce
and body digest, with single-use nonces for replay protection.

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
    hermes/
      pair/                     # redeem a pairing code for a device secret
      capture/                  # signed, idempotent, batched voice captures
      inbox/                    # agent replies, polled by the watch
      device/                   # session-authed pairing codes + revocation
      telegram/webhook/         # inbound replies from the agent
  hermes/                       # pairing + capture dashboard
lib/
  auth, db, env, stripe, entitlement, ratelimit, runtoken, security, validation, logger
  hermes/                       # crypto, device auth, intent, chrono, llm, dispatch, channels
public/game/index.html          # the actual 3D game, served in a sandboxed iframe
hermes-watch/                   # watchOS + iOS apps (XcodeGen project)
prisma/schema.prisma
middleware.ts                   # CSP nonce, auth gate
tests/unit/                     # runtoken, validation, security, hermes
```
