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
public/wonder/index.html        # "The Long Way Here" — a 4-minute real-time film (see below)
prisma/schema.prisma
middleware.ts                   # CSP nonce, auth gate
tests/unit/                     # runtoken, validation, security
```

## The Long Way Here (`/wonder`)

A narrated six-minute film rendered live in the browser, from the first light of
the universe to the pale blue dot, and then to you. It's one self-contained HTML
file with no images, video or audio files.

- **Six chapters, six shaders.** The Big Bang and the cosmic microwave background;
  a volumetric stellar nursery where the first stars ignite and one goes supernova;
  a ray-traced Schwarzschild black hole that tears a star apart and grows jets; an
  Earthrise seen from the Moon's surface; a sunrise over Earth's limb with
  Rayleigh/Mie scattering, aurora, city lights and lightning; a Saturn flyby; and
  Voyager 1 turning back for the Pale Blue Dot at 6.06 billion km.
- **HDR pipeline.** Scenes render to half-float targets, then go through a
  six-level bloom, an anamorphic streak and lens flares, ACES tone mapping,
  chromatic aberration on impacts, grain and letterboxing. Resolution adapts to
  hold the frame rate. WebGL1 falls back to direct tone mapping.
- **Narration.** The script is spoken with the best English voice the device
  offers (Web Speech API). Captions reveal word by word in sync with the voice,
  and the story clock slows if a slower voice needs more time.
- **Score.** Generated live with Web Audio: pads, a formant "choir", strings,
  bells, taiko build-ups, risers and impacts, all timed to the picture.
- **Instruments.** On-screen readouts track the age of the universe, temperature,
  distance to the event horizon, gravitational time dilation, altitude and
  light-time home.
- **Ending.** Tap to light stars for people you love. The constellation is saved
  in `localStorage`, so it's still there next time.

Keys: `→` skips a chapter, `M` mutes, `V` toggles the voice.
