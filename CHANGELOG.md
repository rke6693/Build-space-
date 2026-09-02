# Changelog

## 2.0.0

A rebuild of the same game: identical premise, three acts, and art, rewritten as testable modules and extended with new mechanics, comfort options, and a real test suite.

### Engine

- **Fixed 120 Hz simulation with an accumulator.** Physics no longer depends on display refresh rate; a determinism test asserts two identical input scripts produce identical state.
- **The simulation is DOM-free.** `src/game/simulation.js` reaches for no browser global and communicates through an event queue, so the full rule set runs under `node --test`. A static check enforces the boundary.
- **One 1938-line `game.js` became fourteen modules** under `src/core`, `src/data`, `src/game`, `src/audio`, `src/render`, and `src/ui`.
- **Device-pixel-ratio rendering.** The canvas backing store tracks its CSS box and DPR (capped at 2×) while drawing code keeps working in flat 1280×720 world units.
- **Input is one snapshot from three channels** — keyboard, touch, and now gamepad — merged in `InputState`.

### Gameplay

- **Moving brass shelves** that carry the player, on horizontal and vertical rails, driven by a sine so they cannot drift across a pause.
- **Bloomsprings**: coiled pads that launch the player with no charge at all.
- **Drifters**: floating spore balloons that must be bounced from above and give more lift than a Needler.
- **The Press has a second phase.** At half health it fires a delayed second pair of shockwaves, drops brass rubble, and shortens its own recovery.
- **Echo chains.** Seeds gathered in quick succession raise a multiplier, shown in the HUD, lifting the pickup arpeggio and carried into the run summary.
- **Charge buffering and coyote grace.** A squish pressed just before landing fires on touchdown; a squish held through a landing keeps charging.
- **Assist mode**: five hearts, a faster charge, longer mercy frames, and a slower Press.

### Interface

- **Chapter select** on the title screen for acts you have finished, with per-act best times.
- **Settings panel** for sound, assist mode, and motion preference (system / full / reduced), plus a two-step erase for saved progress.
- **Act intro cards**, a run clock in the header, an echo-chain pip, a phase indicator on the boss meter, and a "new best run" note on the victory screen.
- **Skip control** on story scenes.
- **A visible toast** paired with the existing live-region narration.
- Pause now also triggers on `visibilitychange`, not just window blur.
- Story dialogue listeners are attached per scene and torn down when it ends, so a replayed scene cannot stack duplicate advance handlers.

### Save format

- New key `squishymon-lumenfen-v2`, with a one-time read of the v1 key so existing players keep their field notes.
- Stores per-act best times, furthest act reached, best echo chain, lifetime totals, and grouped settings.
- `normalizeSave` accepts junk — corrupt JSON, negative counters, unknown creature ids, out-of-range act indices — and always returns something usable.
- Write failures are reported rather than swallowed; the settings panel tells the player when a browser is blocking storage.

### Tooling

- **88 unit tests** across the simulation, save format, level data, input merging, and the dev server's path policy.
- **Static checks** now verify that every id `src/ui/dom.js` requires exists in `index.html`, that every dialog has an accessible name, that only module scripts load, and that the three art plates match the SHA-256 checksums recorded in the provenance doc.
- **Hardened dev server**: path-traversal and dotfile rejection, a directory allowlist, `HEAD` support, ETags, security headers, graceful shutdown, and an exported `resolveRequestPath` so the policy is unit-tested directly.
- **CI** runs the full check on Node 20 and 22.

### Level fixes

- Bloomsprings no longer sit inside thorn patches or under patrol routes, and Needler patrols no longer sweep across amber locks. A regression test asserts ground furniture stays separable.

## 1.0.0

Initial release: three acts, the Press, procedural audio, generated art, story scenes, field notes, and local persistence.
