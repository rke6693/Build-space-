# Hermes — Apple Watch voice capture

Press the Action button. Say *"remind me to call mom tomorrow at 4."* Feel the
confirmation haptic. It's with your agent before you've put your wrist down.

Built for **Apple Watch Ultra 2** (works on any watch running watchOS 11+).

```
Action button ──┐
Double Tap ─────┤
Complication ───┼──▶ on-device speech ──▶ signed POST ──▶ relay ──▶ Hermes
Siri ───────────┤         (offline-capable, durable outbox)      (Telegram/SMS/
App ────────────┘                                                webhook/email)
```

## Why it's built this way

**The capture is the only thing that matters.** The user already spoke — losing
those words is the one unrecoverable failure. So every capture is written to
disk *before* any network call, and it stays there until the relay acknowledges
it. No signal, no phone, airplane mode, app killed mid-send, watch rebooted: it
flushes later and the server's idempotency key means a retry never doubles up.

**One button, no stop button.** The capture ends when you stop talking (1.6s of
silence). There is no send button, no confirm screen, no "which list?" prompt.
Pressing the button again while listening means "I'm done" — so an impatient
user is never stuck waiting for the timer.

**Haptics carry the result.** The common case is that you never look at the
screen. Four distinct feels: *started*, *sending*, *delivered*, *saved offline*.
The difference between the last two is the whole point — you should know whether
it actually landed without raising your wrist.

**On-device transcription.** `requiresOnDeviceRecognition` means your audio never
leaves the watch; only the resulting text goes out, and only to the relay you
paired with. It also means capture works with zero connectivity.

**Independent watch app.** `WKRunsIndependentlyOfCompanionApp` — the watch talks
to the relay directly over Wi-Fi or LTE. The iPhone app exists only to pair
(typing an 8-character code on a watch is miserable) and is never needed again.

## Build it

```bash
brew install xcodegen
cd hermes-watch
xcodegen generate
open Hermes.xcodeproj
```

Set `DEVELOPMENT_TEAM` in `project.yml` (or pick your team in Xcode's Signing
tab) before building to a device. The simulator needs nothing.

Targets:

| Target | What it is |
|---|---|
| `HermesWatch` | The watch app — capture, inbox, status |
| `HermesWatchWidgets` | Complications / Smart Stack |
| `HermesPhone` | iPhone pairing app |
| `HermesKitTests` | Signing contract with the relay (`xcodebuild test -scheme "Hermes (Phone)"`) |

`HermesKit/` is shared source compiled into each target rather than a framework —
it keeps signing and entitlements simple at the cost of a little duplication.

## Set it up

1. **Deploy the relay.** It's the Next.js app in the repo root. Set at least one
   channel (see `.env.example` → *Hermes voice relay*). Telegram is the easiest
   and the only one that supports replies back to the watch.
2. **Get a pairing code.** Sign in to the web app, open `/hermes`, tap
   **Generate code**. Single use, ten minutes.
3. **Pair on iPhone.** Open the Hermes phone app, enter your relay host and the
   code. Credentials are pushed to the watch automatically — even if the watch
   is on its charger in another room.
4. **Bind the Action button.** On the watch: **Settings → Action Button →
   Shortcut → Capture for Hermes.**

That's it. Double Tap (pinch twice) also starts a capture, as does the
complication and *"Hey Siri, capture for Hermes."*

## What you can say

The relay interprets, so you don't have to remember syntax:

| You say | It becomes |
|---|---|
| "remind me to call mom tomorrow at 4" | Reminder, due tomorrow 16:00 local |
| "add milk to my grocery list" | List add → *grocery* |
| "set a timer for 10 minutes" | Timer, 10 min |
| "note to self the wifi password is on the router" | Note |
| "tell Sarah I'm running late" | Message → Sarah |
| "i need to refactor the auth module" | Task, no due date |
| "what's on my calendar tomorrow" | Question for the agent |

Anything it can't place becomes a note with the verbatim transcript — it never
discards what you said. The agent always receives the raw transcript alongside
the interpretation, so it can second-guess the classifier.

Long-press the screen instead of tapping to force a plain note.

## Security

- The device secret is handed over **once**, at pairing, and lives in the
  Keychain (`kSecAttrAccessibleAfterFirstUnlock`). It is never sent again.
- Every request carries an HMAC-SHA256 signature over method, path, timestamp,
  nonce and body digest. A captured signature can't be replayed against another
  endpoint, and the body can't be rewritten in flight.
- Nonces are single-use server-side; timestamps outside ±5 minutes are rejected.
- Server-side, the secret is sealed with AES-256-GCM under a key derived from
  `AUTH_SECRET`, so a database dump alone cannot forge captures.
- Revoke a watch instantly from `/hermes`. The next request fails.

`HermesKitTests/RequestSignerTests.swift` and `tests/unit/hermes-vector.test.ts`
assert the *same* fixed signing vector. If either side's canonical string ever
drifts, one of those tests goes red instead of the watch silently failing to
authenticate in the field.

## Layout

```
HermesKit/                  shared by every target
  Capture.swift             wire model — clientId is the idempotency key
  Credentials.swift         Keychain storage
  RequestSigner.swift       HMAC signing (mirrors lib/hermes/crypto.ts)
  HermesAPI.swift           signed client: pair, send, inbox
  CaptureQueue.swift        durable outbox, actor, App Group container
  IntentPreview.swift       instant local guess for the confirmation icon
  WatchLink.swift           phone → watch credential handoff
  Haptics.swift
HermesWatch/
  HermesWatchApp.swift      entry, background refresh, deep links
  CaptureView.swift         the one screen
  CaptureViewModel.swift    idle → listening → sending → confirmed/queued
  SpeechRecognizer.swift    on-device dictation + silence detection
  HermesIntents.swift       App Intents — this is what the Action button runs
  InboxView.swift           replies from the agent
  StatusView.swift          pairing + outbox depth
HermesWatchWidgets/         complications
HermesPhone/                pairing only
```

## Known limits

- Replies from the agent are **polled**, not pushed. Push would need an APNs key
  on the relay; polling on wrist-raise and background refresh is close enough at
  this volume and keeps the relay free of Apple credentials.
- The watch does no natural-language parsing itself — `IntentPreview` only picks
  an icon. All real interpretation is server-side, so it improves without
  shipping a watch update.
- Background refresh is at the system's discretion. A queued capture flushes on
  the next app open at the latest.
- **The Telegram channel is single-tenant.** The bot token and chat id are
  server configuration, so inbound replies are attributed to the most recently
  active device. That is correct for one person's own relay — which is what this
  is for — but serving several users means moving the chat id onto the user
  record. Captures themselves are always owner-scoped and unaffected.
