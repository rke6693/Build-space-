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
- **Rez-style lock-on.** Hold FIRE to paint targets, then release for a homing volley.
  A barrel roll deflects shots back at enemies.
- **Four ships to choose from.** Every run starts in the hangar, where you swipe between ships
  on a turntable and the announcer calls out each name:
  - **Synthwing:** the all-rounder. Builds Resonance 30% faster.
  - **Bassline:** a heavy twin-boom gunship with 150 shield and 25% armor. It fires slow,
    heavy bass bolts that punch through what they kill, and takes 6 lock-ons.
  - **Arpeggio:** a needle-nosed interceptor with forward-swept wings. It has the fastest
    handling, rapid fire, quick rolls and 10 lock-ons, but only 70 shield.
  - **Maestro:** a golden flying wing with a lyre crest. It starts with twin lasers and its
    volleys hit 50% harder. Unlocked by finding all five golden tuning forks.
- **Power-ups.** Crystal prism pods drift into view carrying a power-up; shoot one (or fly
  into it) to free the prize. Big enemies drop power-ups too.
  - **Chord Shot:** fires a spread of 3, or 5 with hyper lasers.
  - **Echo:** two drones that copy every shot.
  - **Tempo:** double fire rate and faster lock-ons.
  - **Harmony:** three orbiting notes that block shots and sting enemies.
  - **Fortissimo:** invincible and rams enemies, with the full music arrangement.
  - **Encore:** an extra ship.

  Active power-ups show as icons with draining timers under the shield gauge.
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
- **A squadron with a story.** Oz, Sable and Tobi (with Admiral Maren on comms) talk in
  synthesized "bit-voice" chatter. Each character has a voice that fits their role: Oz's
  gravelly veteran growl, Sable's clipped purr, Tobi's chirpy squeaks, Maren's deep
  commanding bass. The Hush whispers in noise and the drones buzz like ring-modulated robots.
  Syllables follow the text: sentences fall in pitch, questions rise, and ALL-CAPS words are
  stressed. Portraits lip-sync to the syllables. Save wingmates when they're chased; losing
  them costs you the stage medal.
- **Comms that stay out of your way.** In flight, lines arrive over a thin radio channel,
  with a squelch at each end, sparser chatter and only a slight dip in the music. They
  appear in a compact see-through strip in the bottom-left corner (bottom-right with the
  left-handed layout, just above the thumb controls in portrait). The strip fades back
  whenever your ship or reticle passes over it, and
  chatter that has gone stale is dropped. Briefings and title cards get the full treatment:
  a big panel, full voice with the music ducked, and an announcer who calls out stage
  names, MISSION ACCOMPLISHED and GAME OVER.
- **64-bit look at HD resolution.** A hand-written WebGL2 renderer that renders at native display
  resolution by default. If the frame rate drops, a dynamic-resolution governor lowers the
  internal resolution until it recovers. It uses N64 3-point texture filtering, 16-bit ordered
  dithering, per-pixel fog and sphere-map chrome. Settings offer 480p, 360p and 240p retro
  modes with a soft "VI" upscale, plus optional CRT scanlines.
- **No libraries and no asset files.** Every model, texture, font, portrait, song and sound
  effect is generated in code at startup.
- **Haptics.** Every shot ticks, and kills, lock-ons, rolls, pickups, hits, bombs, alarms,
  your ship going down and boss kills each have their own pattern (set OFF, LIGHT or FULL).
  Android plays vibration patterns and gamepads get dual-rumble. On iPhone, Safari has no
  vibration API, so the game uses the iOS 18+ switch-control tick (System Haptics must be
  on). WebKit only plays it while handling a finger lifting, so on iPhone you feel a tick
  on each FIRE tap and each menu button, a burst when you release a lock-on volley, and
  patterns on BOMB, ROLL and flick-rolls. Continuous autofire and taking damage can't
  vibrate an iPhone from a web page.
- **Mobile first.** Floating analog stick or touchpad steering, left-handed layout,
  safe-area aware HUD, gamepad and keyboard support, and a PWA manifest with an offline
  service worker.
- **20 awards and an attract demo.** Achievements come with unlock toasts and an AWARDS
  screen, plus lifetime tallies. Left idle on the title screen, the game plays itself like
  an arcade cabinet until you tap.
- **Built not to crash.**
  - Saves are type-checked on load.
  - Audio faults and gamepad API errors are isolated.
  - A frame guard logs any error and recovers to the title.
  - The game pauses on backgrounding, Control Center and iOS audio interruptions.
  - `node scripts/synthwing-soak.mjs` runs chaos/soak tests (monkey input, context loss,
    corrupted saves, full campaigns) and fails on any error.

### iOS app
`apps/synthwing-ios` is the native App Store build (Capacitor 8). It adds Taptic Engine
haptics, Game Center leaderboards and achievements, a full-screen shell, controller
support and a privacy manifest. It also includes the App Store listing, screenshots and
a release checklist. CI (`.github/workflows/ios.yml`) builds it on macOS, runs the attract
demo in the iOS Simulator and fails on any crash or logged error. See
`apps/synthwing-ios/README.md`.

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
file (about 460 KB). Pass `--artifact` to get a body-only variant for hosts that supply
their own `<head>`.

### Code map (`public/game/synthwing/js`)
`util` math/noise/error log · `native` iOS app bridge · `gl` renderer · `mesh` builder, textures, sprite atlas · `font` pixel font
and portraits · `models` all 3D models · `audio` synth, sequencer, SFX · `songs` the score ·
`input` touch/keys/pad · `world` rail, environments, terrain streaming · `fx` particles and
trails · `entities` player, enemies, pickups, wingmen · `bosses` · `stages` scripted
timelines · `game` scene flow and simulation · `hud` HUD and menus · `main` boot loop.
