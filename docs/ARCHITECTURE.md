# Architecture

Squishymon has one architectural rule, and everything else follows from it:

> **The simulation knows nothing about the browser.**

`src/game/simulation.js` never touches `document`, `window`, `navigator`, or `localStorage`. It takes a fixed time slice and an input snapshot, mutates plain objects, and appends records to an event queue. A static check enforces this, and it is the reason the whole rule set — physics, damage, the boss state machine, act flow, assist scaling — is testable in Node with no DOM shim.

## A frame

```
requestAnimationFrame
        │
        ├── input.pollGamepad()            merge pad state into the input channels
        │
        ├── while (accumulator >= STEP)    fixed 1/120s steps, never variable
        │     └── sim.step(STEP, snapshot)
        │           ├── movers, player, enemies, seeds, shockwaves, rubble, boss
        │           └── events.push(...)   sound / burst / shake / announce / flow
        │
        ├── handleSimEvents()              drain the queue into audio, particles,
        │                                  narration, unlocks, and act transitions
        ├── hud.sync(sim)                  mirror state into the DOM overlay
        ├── effects.update(delta)          particles and decay run on wall time
        └── scene.draw(ctx, sim, now)      read-only render of simulation state
```

Two clocks, on purpose. **Gameplay** runs on the fixed step so a 144 Hz monitor and a 60 Hz laptop produce identical physics; a determinism test pins that down. **Presentation** — particles, screen shake, the flash, the parallax drift — runs on wall-clock delta, because nothing there can change the outcome of a run.

## The event queue

The simulation cannot play a sound. It can only say that a sound happened:

```js
this.events.sound("spring");
this.events.burst(spring.x, spring.y - 12, "mint", 18, 260, "leaf");
this.events.push("unlock", { id: "bloomspring" });
```

`src/main.js` drains that queue once a frame and decides what each record means: a `sound` becomes a Web Audio cue, a `burst` becomes particles, an `announce` becomes live-region text, a `levelComplete` becomes a story scene followed by the next act.

Three things fall out of this:

- Colours cross the boundary as **tone names** (`"mint"`, `"coral"`), never as colour values. The renderer resolves them against the CSS custom properties, so the canvas and the page chrome share one palette by construction.
- A test can assert on intent — "landing on a Bloomspring emits a `bloomspring` unlock" — rather than on side effects it would have to mock.
- Turning off every effect would still leave a playable game.

## Where state lives

| State | Owner | Notes |
| --- | --- | --- |
| Physics, entities, act progress | `Simulation` | Rebuilt per act by `createLevel` |
| Particles, shake, flash, ambience | `Effects` | Purely cosmetic, wall-clock timed |
| Screen mode, transitions, focus | `state` in `main.js` | `title / story / playing / paused / panel / victory / gameover` |
| Field notes, best times, settings | `save` | Normalized on read; see below |
| Which keys and buttons are down | `InputState` | Three channels, ORed into one snapshot |

## Input

Keyboard, touch, and gamepad write into separate channels of `InputState`; `snapshot()` ORs them into `{ left, right, squish }`. The simulation sees only that object, so it needs no notion of device — and a stuck key from a lost focus event is cleared by releasing one channel rather than untangling three code paths.

Squish is edge-detected inside the simulation. A press while airborne sets `chargeBuffer`; the charge starts the instant the player lands. Walking off a ledge leaves `coyote` running for a moment. Together those make the single-verb control scheme forgiving without changing its physics.

## Movers

Moving shelves ride a sine wave, so position is a pure function of the level clock rather than an integrated velocity:

```js
moverAt(mover, time) → { x, y }
```

That means a mover cannot drift after a pause, cannot desync between two runs, and can be tested by sampling. Carrying the player is then a subtraction: each step stores the previous position, and a player whose `groundMoverId` matches gets the delta added to their x.

## The save

`normalizeSave` accepts anything — a v1 blob, a truncated object, hand-edited JSON, `null` — and returns a save every other module can use without guarding. Unknown unlock ids are dropped, negative counters become zero, an out-of-range act index clamps to the campaign, and a v1 top-level `sound` flag migrates into `settings`. Writes report success so the settings panel can tell the player when a browser is blocking storage instead of silently losing their progress.

## The dev server

`server.mjs` resolves every request to an absolute path, checks it is still inside the project root, rejects any segment beginning with a dot, and then requires the first segment to be `index.html` or one of `src/`, `styles/`, `assets/`. `resolveRequestPath` is exported so the policy is unit-tested directly rather than through sockets.

## Adding things

- **A creature**: add an entry to `src/data/creatures.js`, then emit `events.push("unlock", { id })` wherever the player first meets it. The field-note grid and the save allowlist pick it up.
- **A level element**: add the tuple shape to `src/data/levels.js`, inflate it in `createLevel`, update the simulation, and draw it in `Scene`. The level test asserts goals stay satisfiable and that ground furniture does not overlap.
- **An act**: append to `LEVEL_DEFS`. `ACT_COUNT` drives the chapter select, the save's `actBests`, and the act-unlock clamp.
- **A sound**: add a case to `Soundscape.play` and emit `events.sound(name)`. Nothing else changes.
