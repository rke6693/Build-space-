import AppIntents
import SwiftUI

/// This is the piece that makes the Action button work.
///
/// watchOS does not let a third-party app bind the Action button directly.
/// What it *does* allow: Settings → Action Button → Shortcut → any shortcut,
/// and an `AppShortcutsProvider` publishes these intents as shortcuts
/// automatically, with no setup in the Shortcuts app. So the user goes to
/// Settings once, picks "Capture for Hermes", and from then on one press of
/// the Action button opens the app already listening.
///
/// The same intents are reachable from Siri, the Smart Stack, a complication,
/// and the Shortcuts app — one implementation covers every entry point.
struct CaptureForHermesIntent: AppIntent {
    static let title: LocalizedStringResource = "Capture for Hermes"
    static let description = IntentDescription(
        "Start listening and send what you say to your Hermes agent.",
        categoryName: "Capture"
    )

    /// The app must come to the foreground: we need the microphone and we want
    /// the user to see the live transcript.
    static let openAppWhenRun = true

    @MainActor
    func perform() async throws -> some IntentResult {
        // The pending source is read by the app on launch, so a capture started
        // from the Action button is recorded as such rather than as a tap.
        PendingLaunchAction.set(.actionButton)
        return .result()
    }
}

/// A variant that skips the classifier's guesswork — useful as a second
/// shortcut on the Double Tap or in a complication.
struct NoteForHermesIntent: AppIntent {
    static let title: LocalizedStringResource = "Note for Hermes"
    static let description = IntentDescription(
        "Capture what you say as a plain note, without interpreting it.",
        categoryName: "Capture"
    )
    static let openAppWhenRun = true

    @MainActor
    func perform() async throws -> some IntentResult {
        PendingLaunchAction.set(.actionButton, hint: .note)
        return .result()
    }
}

/// Flushes anything the watch captured while offline. Handy to attach to a
/// complication, and the Smart Stack can surface it when connectivity returns.
struct FlushHermesQueueIntent: AppIntent {
    static let title: LocalizedStringResource = "Send queued Hermes captures"
    static let description = IntentDescription(
        "Deliver any captures saved while the watch was offline.",
        categoryName: "Capture"
    )
    static let openAppWhenRun = false

    func perform() async throws -> some IntentResult & ProvidesDialog {
        guard let credentials = CredentialStore.load() else {
            return .result(dialog: "This watch isn't paired with Hermes yet.")
        }
        let delivered = await CaptureQueue.shared.flush(using: HermesAPI(credentials: credentials))
        let remaining = await CaptureQueue.shared.depth

        if delivered.isEmpty && remaining == 0 {
            return .result(dialog: "Nothing waiting to send.")
        }
        if remaining > 0 {
            return .result(dialog: "Sent \(delivered.count). \(remaining) still waiting.")
        }
        return .result(dialog: "Sent \(delivered.count) capture\(delivered.count == 1 ? "" : "s").")
    }
}

/// Publishing these makes them appear as shortcuts with no user setup, which is
/// what the Action button picker lists.
struct HermesShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: CaptureForHermesIntent(),
            phrases: [
                "Capture for \(.applicationName)",
                "Tell \(.applicationName)",
                "New \(.applicationName) capture",
            ],
            shortTitle: "Capture",
            systemImageName: "mic.fill"
        )
        AppShortcut(
            intent: NoteForHermesIntent(),
            phrases: ["Note for \(.applicationName)", "\(.applicationName) note"],
            shortTitle: "Note",
            systemImageName: "note.text"
        )
        AppShortcut(
            intent: FlushHermesQueueIntent(),
            phrases: ["Send queued \(.applicationName) captures"],
            shortTitle: "Send queued",
            systemImageName: "tray.and.arrow.up.fill"
        )
    }
}

/// A one-shot handoff from an intent to the app that the intent just launched.
///
/// App launch and intent execution race, so the intent leaves a note here and
/// the app reads it on appear. Deliberately short-lived: a stale value would
/// make the *next* manual launch start recording on its own.
enum PendingLaunchAction {
    private static let key = "hermes.pendingLaunchAction"
    private static let hintKey = "hermes.pendingLaunchHint"
    private static let stampKey = "hermes.pendingLaunchStamp"
    private static let ttl: TimeInterval = 10

    static func set(_ source: CaptureSource, hint: CaptureIntent? = nil) {
        let defaults = UserDefaults.standard
        defaults.set(source.rawValue, forKey: key)
        defaults.set(hint?.rawValue, forKey: hintKey)
        defaults.set(Date().timeIntervalSince1970, forKey: stampKey)
    }

    /// Returns and clears the pending action, if one was set recently enough.
    static func take() -> (source: CaptureSource, hint: CaptureIntent?)? {
        let defaults = UserDefaults.standard
        defer {
            defaults.removeObject(forKey: key)
            defaults.removeObject(forKey: hintKey)
            defaults.removeObject(forKey: stampKey)
        }
        guard let raw = defaults.string(forKey: key),
              let source = CaptureSource(rawValue: raw),
              Date().timeIntervalSince1970 - defaults.double(forKey: stampKey) < ttl
        else { return nil }

        let hint = defaults.string(forKey: hintKey).flatMap(CaptureIntent.init(rawValue:))
        return (source, hint)
    }
}
