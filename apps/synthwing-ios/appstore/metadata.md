# SYNTHWING 64: App Store listing

Everything App Store Connect asks for, ready to paste. Character counts are
within Apple's limits.

## Identity

| Field | Value |
|---|---|
| Name (30) | Synthwing 64 |
| Subtitle (30) | Lasers That Play the Music |
| Bundle ID | `com.rke6693.synthwing64` (change in Xcode and `capacitor.config.json` if you use another) |
| Primary category | Games › Action |
| Secondary category | Games › Arcade |
| Age rating | 9+ (questionnaire: *Cartoon or Fantasy Violence: Infrequent/Mild*; everything else *None*) |
| Price | Your call. Upfront paid (no ads, no IAP) suits the premium feel. |
| Game Center | Yes (leaderboards + achievements below) |
| Controllers | Supported (Extended Gamepad), which earns the App Store badge |

## Promotional text (170)

Fly a squadron of sound through five hand-crafted worlds. Every laser, lock-on and explosion lands on the beat, and the soundtrack grows as you play. No ads, no tracking.

## Keywords (100)

```
retro,space shooter,arcade,rhythm,music,synthwave,pixel,flight,pilot,rail shooter,boss,offline,3d
```

## Description

A 64-bit era space shooter where your lasers play the soundtrack.

The Hush has silenced the Octave Cluster. Join Synthwing Squadron: a
gravel-voiced veteran, a sharp-tongued ace and an over-eager rookie. Fly
into five worlds to bring their music back, one shot at a time.

MUSIC YOU PLAY
Every song is layered. Kills build Resonance and add instruments to the
arrangement, up to a ×5 multiplier. Lock-ons, rings and explosions land on
the beat and play in key, so a perfect volley sounds like a chord.

LOCK ON, LET GO
Hold to paint up to ten targets, release to unleash a homing volley. Barrel
roll to bat enemy shots straight back at them.

FOUR SHIPS, FOUR SOUNDS
Choose your ship in the hangar: the balanced Synthwing, the heavily armoured
Bassline with its piercing bass bolts, the lightning-fast Arpeggio, or unlock
the golden Maestro.

SIX POWER-UPS
Crack crystal pods for Chord Shot spreads, Echo drones that copy your fire,
Tempo rapid-fire, Harmony notes that block bullets, invincible Fortissimo
ramming, and Encore extra ships.

FIVE WORLDS, FIVE COLOSSAL BOSSES
Sun-bleached seas, a mining asteroid belt, a singing ice canyon, a lava
forge and a colourless void. Each ends in a boss you take apart piece by
piece.

MADE FOR IPHONE
Native HD rendering with a genuine 64-bit look, Taptic Engine feedback for
every shot and hit, touch controls built for thumbs, full controller
support, Game Center leaderboards and 20 achievements. It plays fully
offline.

No ads. No tracking. No data collected.

## What's new (1.0)

First flight. Five worlds, four ships, six power-ups, twenty awards.

## App privacy

**Data Not Collected.** Saves stay on the device, and there are no analytics,
ads or accounts. Game Center is Apple's own service. The app ships a privacy
manifest (`PrivacyInfo.xcprivacy`) declaring no tracking and no data
collection.

## Review notes

> No account needed. Tap START GAME → LAUNCH, then tap through the briefing to
> fly. Controls: drag the left half to steer, tap/hold the right half to fire
> and lock on. Game Center sign-in is optional. Leaving the game idle on the
> title for 25 seconds starts a self-playing demo; tap to exit it.

## Screenshots

`screenshots/iphone-6.9/` has 2868×1320 landscape shots for the 6.9" iPhone
slot. App Store Connect scales them down for smaller iPhones.
`screenshots/ipad-13/` has 2752×2064 shots for the 13" iPad slot. All are
JPEG with no alpha channel, rendered by the real game at native resolution.

## Game Center

Create these in App Store Connect → your app → Services → Game Center. The
IDs must match exactly; the game adds the `synthwing64.` prefix.

### Leaderboards (classic, high score, integer, descending)

| ID | Name |
|---|---|
| `synthwing64.highscore` | High Score |
| `synthwing64.stage.corona` | Corona Shores |
| `synthwing64.stage.halo` | Halo Belt |
| `synthwing64.stage.frost` | Frostline |
| `synthwing64.stage.forge` | The Forge |
| `synthwing64.stage.hush` | The Hush |

### Achievements (1000 points total)

| ID | Title | Description | Points |
|---|---|---|---|
| `synthwing64.first_flight` | First Flight | Clear Corona Shores. | 25 |
| `synthwing64.finale` | Standing Ovation | Finish the campaign. | 90 |
| `synthwing64.virtuoso` | Virtuoso | Clear a stage on ACE difficulty. | 70 |
| `synthwing64.flawless` | Flawless | Clear a stage without taking a hit. | 70 |
| `synthwing64.medal` | Gold Standard | Earn a stage medal. | 40 |
| `synthwing64.all_medals` | Hall of Fame | Earn all five stage medals. | 90 |
| `synthwing64.fork` | Perfect Pitch | Find a golden tuning fork. | 30 |
| `synthwing64.all_forks` | In Tune | Find all five tuning forks. | 70 |
| `synthwing64.rescue` | Wingmate | Rescue a wingman in trouble. | 25 |
| `synthwing64.squad` | No One Left Behind | Clear a stage with all wingmen. | 40 |
| `synthwing64.chain` | Perfect Chord | Destroy 8 targets in one volley. | 40 |
| `synthwing64.resonance` | Full Orchestra | Reach Resonance MAX. | 30 |
| `synthwing64.nova` | Supernova | Take out 10 foes with one Nova Bomb. | 40 |
| `synthwing64.deflect` | Return to Sender | Deflect 25 shots with barrel rolls. | 40 |
| `synthwing64.fortissimo` | Wrecking Ball | Ram 10 enemies in one Fortissimo. | 40 |
| `synthwing64.full_kit` | Full Kit | Collect every kind of power-up. | 40 |
| `synthwing64.test_pilot` | Test Pilot | Clear stages in 3 different ships. | 50 |
| `synthwing64.kills` | Sold-Out Show | Destroy 2,000 enemies. | 50 |
| `synthwing64.score` | Chart Topper | Score 500,000 points in one run. | 70 |
| `synthwing64.maestro` | Maestro | Take the Maestro into battle. | 50 |
