import Foundation
import SwiftUI
import WatchKit
import os

/// The whole app in one state machine.
///
/// Idle → listening → sending → confirmed/queued/failed → idle.
///
/// The important property: every transition after `listening` is non-blocking
/// from the user's point of view. Once they stop speaking the capture is
/// already on disk, so they can drop their wrist and walk away; the UI is just
/// reporting what happened to something already safe.
@MainActor
final class CaptureViewModel: ObservableObject {
    enum Phase: Equatable {
        case idle
        case listening
        case sending(transcript: String, preview: CaptureIntent)
        case confirmed(CaptureResult)
        case queued(transcript: String, preview: CaptureIntent)
        case failed(String)
    }

    @Published private(set) var phase: Phase = .idle
    @Published private(set) var queueDepth = 0
    @Published private(set) var isPaired = CredentialStore.load() != nil
    @Published var unread: [InboxMessage] = []

    let speech = SpeechRecognizer()

    private let logger = Logger(subsystem: "com.hermes.relay", category: "capture")
    private var resetTask: Task<Void, Never>?
    private var lastInboxCheck: Date?

    var credentials: Credentials? { CredentialStore.load() }

    // MARK: - The one button

    /// Starts a capture. Called by the tap target, the Action button intent,
    /// the Double Tap gesture and the complication — all the same path.
    func beginCapture(source: CaptureSource = .app, hint: CaptureIntent? = nil) {
        resetTask?.cancel()

        guard isPaired else {
            phase = .failed("Pair this watch in the Hermes app on your iPhone")
            return
        }
        guard phase != .listening else {
            // A second press while listening means "I'm done" — the same button
            // both starts and confirms, so an impatient user is never stuck.
            speech.stop()
            return
        }

        Task {
            guard await SpeechRecognizer.requestAuthorization() else {
                Haptics.failed()
                phase = .failed("Allow microphone and speech access in Settings")
                return
            }
            phase = .listening
            speech.start { [weak self] result in
                guard let self else { return }
                switch result {
                case let .success(transcript):
                    self.handle(transcript: transcript, source: source, hint: hint)
                case let .failure(error):
                    Haptics.failed()
                    self.phase = .failed(error.localizedDescription)
                    self.scheduleReset(after: 2.5)
                }
            }
        }
    }

    func cancelCapture() {
        speech.cancel()
        phase = .idle
    }

    // MARK: - Delivery

    private func handle(transcript: String, source: CaptureSource, hint: CaptureIntent?) {
        let preview = hint ?? IntentPreview.guess(transcript)
        phase = .sending(transcript: transcript, preview: preview)
        Haptics.thinking()

        let capture = Capture(
            transcript: transcript,
            timeZone: .current,
            intentHint: hint,
            source: source,
            batteryLevel: batteryLevel()
        )

        Task {
            // Disk first, network second. If the app is killed in the next
            // millisecond the capture is still going to be delivered.
            await CaptureQueue.shared.enqueue(capture)
            await refreshQueueDepth()

            guard let credentials else {
                Haptics.queued()
                phase = .queued(transcript: transcript, preview: preview)
                scheduleReset(after: 3)
                return
            }

            let results = await CaptureQueue.shared.flush(using: HermesAPI(credentials: credentials))
            await refreshQueueDepth()

            if let mine = results.first(where: { $0.clientId == capture.clientId }), mine.reachedAgent {
                Haptics.delivered()
                phase = .confirmed(mine)
                scheduleReset(after: 4)
            } else {
                // Still in the outbox: no signal, or the relay could not reach
                // any channel. Either way it is saved and will be retried.
                Haptics.queued()
                phase = .queued(transcript: transcript, preview: preview)
                scheduleReset(after: 3)
            }
        }
    }

    /// Drains the outbox. Safe to call from anywhere — background refresh, app
    /// activation, or a manual tap in settings.
    func flushQueue() async {
        guard let credentials else { return }
        await CaptureQueue.shared.flush(using: HermesAPI(credentials: credentials))
        await refreshQueueDepth()
    }

    func refreshQueueDepth() async {
        queueDepth = await CaptureQueue.shared.depth
    }

    func refreshPairing() {
        isPaired = CredentialStore.load() != nil
    }

    // MARK: - Inbox

    /// Polls for replies from the agent. Rate-limited locally so a chatty UI
    /// cannot hammer the relay on every view appearance.
    func refreshInbox(force: Bool = false) async {
        guard let credentials else { return }
        if !force, let last = lastInboxCheck, Date().timeIntervalSince(last) < 30 { return }
        lastInboxCheck = Date()
        unread = (try? await HermesAPI(credentials: credentials).inbox(limit: 20)) ?? unread
    }

    func markRead(_ messages: [InboxMessage]) async {
        guard let credentials, !messages.isEmpty else { return }
        try? await HermesAPI(credentials: credentials).markRead(messages.map(\.id))
        let read = Set(messages.map(\.id))
        unread.removeAll { read.contains($0.id) }
    }

    // MARK: - Helpers

    private func scheduleReset(after seconds: TimeInterval) {
        resetTask?.cancel()
        resetTask = Task {
            try? await Task.sleep(for: .seconds(seconds))
            guard !Task.isCancelled else { return }
            phase = .idle
        }
    }

    private func batteryLevel() -> Double? {
        let device = WKInterfaceDevice.current()
        device.isBatteryMonitoringEnabled = true
        let level = device.batteryLevel
        return level < 0 ? nil : Double(level)
    }
}
