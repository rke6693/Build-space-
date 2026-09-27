# SYNTHWING 64 for iOS

The game from `public/game/synthwing`, packaged as a native iOS app with
[Capacitor 8](https://capacitorjs.com). The whole game ships inside the app
bundle as one HTML file, so it runs fully offline.

What the native shell adds on top of the web build:

- **Real haptics.** The Taptic Engine plays impact and notification
  patterns for firing, lock-ons, kills, hits, bombs, boss kills and more
  (`@capacitor/haptics`, driven by `js/native.js`).
- **Game Center.** Sign-in, 6 leaderboards, 20 achievements and the
  dashboard (`ios/App/App/GameCenterPlugin.swift`).
- **Full screen.** The status bar and home indicator are hidden, and edge
  swipes need a second swipe during play.
- **Controllers.** Extended Gamepad support is declared, which earns the App
  Store badge.
- **Privacy.** The privacy manifest declares no tracking and no data
  collected; no export-compliance question.

## Build

Requirements: macOS with Xcode 16+, Node 20+.

```sh
cd apps/synthwing-ios
npm ci
npm run sync      # builds the game into www/ and syncs the Xcode project
npm run open      # opens ios/App/App.xcodeproj in Xcode
```

Run `npm run sync` again after any change to the game.

## Release checklist

1. **Bundle ID and team.** In Xcode, select the *App* target, open *Signing &
   Capabilities*, and pick your team. If `com.rke6693.synthwing64` isn't
   yours, change it here and in `capacitor.config.json`.
2. **Capabilities.** *Game Center* is already in `App.entitlements`; Xcode
   shows it under Signing & Capabilities once a team is set.
3. **App Store Connect.** Create the app with the same bundle ID. Then:
   - Paste the listing from `appstore/metadata.md`.
   - Upload the screenshots from `appstore/screenshots/`.
   - Under *Services › Game Center*, create the leaderboards and
     achievements with the exact IDs in `metadata.md`.
   - Set the age rating (9+) and privacy (*Data Not Collected*).
4. **Version.** Bump *Version* / *Build* on the target (MARKETING_VERSION /
   CURRENT_PROJECT_VERSION).
5. **Archive.** *Product › Archive*, then *Distribute App › App Store Connect*,
   then TestFlight.
6. **Device test.** Before submitting, play a full stage on a real iPhone
   with sound on and off (ring/silent switch), with System Haptics on, and
   with a controller if you have one.

## Continuous integration

`.github/workflows/ios.yml` runs on every change to the game or this app:

- **Simulator job.** Builds Debug for the iOS Simulator, boots an iPhone Pro
  Max simulator, and launches the app with `SYNTHWING_DEMO=1`. That starts
  the game's self-playing attract demo, which is real gameplay with WebGL,
  audio and effects in WKWebView. The job waits for the game's `ready` and
  `demo` markers, lets it play for 30 s, then takes a screenshot. It fails if
  the app crashes or the game logs any error.
- **Device-release job.** An unsigned Release build for real devices, which
  proves the App Store configuration compiles.

Both jobs upload nothing to Apple and need no signing secrets.

## Assets

- `appstore/icon-1024.png`: the App Store icon (RGB, no alpha, as required).
  The same file is `AppIcon` in the asset catalog.
- `Splash.imageset`: the launch image (the pixel wordmark on the ink
  background). The launch screen background is the same ink colour, so
  there's no white flash.
- `appstore/screenshots/`: store screenshots rendered by the real game at the
  exact store resolutions.

The web game's own chaos test (`node scripts/synthwing-soak.mjs` from the repo
root) exercises the same code paths in Chromium: every screen, corrupted
saves, context loss, backgrounding and full campaigns.
