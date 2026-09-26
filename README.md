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

---

# SYNTHWING 64

A 64-bit era on-rails space shooter where your lasers play the soundtrack. It lives in
`public/game/synthwing/` and is built for iPhone (tuned on an iPhone 17 Pro Max in
landscape), but it runs in any modern browser with WebGL2.

**Play locally:** `npx http-server public/game/synthwing` and open the printed URL. With
the Next.js app running, it's also served at `/game/synthwing/index.html`. On iPhone,
use Share → Add to Home Screen for fullscreen, offline play.

### What's in it
- **Five worlds and five bosses.** Corona Shores (tropical sea), Halo Belt (asteroid field),
  Frostline (aurora ice canyon), The Forge (lava factory) and The Hush (a colorless void).
  The bosses are the Conductor, the Grinder, the Glass Serpent, the Anvil and the Hush.
- **Music-driven combat.** Every song is layered. Kills build *Resonance*, which adds layers
  to the music and raises the score multiplier up to ×5; getting hit strips layers away.
  Lock-on hits, rings and kills are quantized to the beat and pitched to the current chord,
  and enemies fire on the beat.
- **Rez-style lock-on.** Hold FIRE to paint up to 8 targets, then release for a homing volley.
  A barrel roll deflects shots back at enemies.
- **Enemies that react.** Hits knock enemies back, spin them and squash them on springs. Damaged
  units smoke, and a wounded enemy returns fire. Enemies barrel-roll out of your reticle if you
  linger on them. Destroyed fliers spin out trailing fire and explode on impact, splashing water
  or spattering lava. Rocks crumble into chunks. Bosses reel when a part breaks and enrage
  below 30% health.
- **Flight patterns.** Enemies snake in weaving chains, loop in from behind, strafe across the
  screen and dive-bomb from above. Wings flap, fin rings spin and turret barrels aim and recoil.
  Each shot is telegraphed by a glowing core that swells on the beat before it fires.
- **Screen feel.** Big explosions send a refracting shockwave across the screen and punch the
  camera's field of view. Weapons have muzzle flashes, the ship jolts when hit, the score rolls
  up and the shield bar shows a trailing damage ghost.
- **A squadron with a story.** Oz, Sable and Tobi (with Admiral Maren on comms) talk through
  animated pixel portraits in synthesized gibberish voices. Save wingmates when they're
  chased; losing them costs you the stage medal.
- **64-bit look at HD resolution.** A hand-written WebGL2 renderer that renders at native display
  resolution by default. If the frame rate drops, a dynamic-resolution governor lowers the
  internal resolution until it recovers. It uses N64 3-point texture filtering, 16-bit ordered
  dithering, per-pixel fog and sphere-map chrome. Settings offer 480p, 360p and 240p retro
  modes with a soft "VI" upscale, plus optional CRT scanlines.
- **No libraries and no asset files.** Every model, texture, font, portrait, song and sound
  effect is generated in code at startup.
- **Mobile first.** Floating analog stick or touchpad steering, left-handed layout,
  safe-area aware HUD, haptics (iOS 18+ switch trick), gamepad and keyboard support, and a
  PWA manifest with an offline service worker.

### Controls
| | Touch | Keyboard | Gamepad |
|---|---|---|---|
| Steer | drag left half | WASD / arrows | left stick |
| Fire / lock-on | tap / hold right half | Space (hold) | A / RT |
| Barrel roll | ROLL, double-tap, flick | Shift, Q/E | LB / RB |
| Nova bomb | BOMB | K / X | B |
| Pause | ‖ button | Esc / P | Start |

### Single-file build
`node scripts/build-synthwing.mjs` writes `dist/synthwing64.html`, the whole game in one
file (about 370 KB). Pass `--artifact` to get a body-only variant for hosts that supply
their own `<head>`.

### Code map (`public/game/synthwing/js`)
`util` math/noise · `gl` renderer · `mesh` builder, textures, sprite atlas · `font` pixel font
and portraits · `models` all 3D models · `audio` synth, sequencer, SFX · `songs` the score ·
`input` touch/keys/pad · `world` rail, environments, terrain streaming · `fx` particles and
trails · `entities` player, enemies, pickups, wingmen · `bosses` · `stages` scripted
timelines · `game` scene flow and simulation · `hud` HUD and menus · `main` boot loop.
