import SwiftUI

/// The entire app, on one screen.
///
/// Design rules, in priority order:
///   1. The target is the whole screen. On a wrist, in motion, in gloves,
///      precision tapping is not available — so there is nothing to miss.
///   2. Never more than one thing to decide. There is no "send" button; the
///      capture sends itself when you stop talking.
///   3. State is legible at a glance and confirmed by haptics, because the
///      common case is that the user never looks at the screen at all.
struct CaptureView: View {
    @EnvironmentObject private var model: CaptureViewModel
    @Environment(\.scenePhase) private var scenePhase

    var body: some View {
        ZStack {
            background.ignoresSafeArea()

            switch model.phase {
            case .idle:
                idle
            case .listening:
                listening
            case let .sending(transcript, preview):
                sending(transcript: transcript, preview: preview)
            case let .confirmed(result):
                confirmed(result)
            case let .queued(transcript, preview):
                queued(transcript: transcript, preview: preview)
            case let .failed(message):
                failed(message)
            }
        }
        // The whole screen is the button.
        .contentShape(Rectangle())
        .onTapGesture { model.beginCapture(source: .app) }
        // Long press biases an ambiguous phrase toward a plain note, for the
        // "just write this down verbatim" case.
        .onLongPressGesture(minimumDuration: 0.5) {
            model.beginCapture(source: .app, hint: .note)
        }
        .task {
            await model.refreshQueueDepth()
            await model.refreshInbox()
        }
        .onChange(of: scenePhase) { _, phase in
            // Coming back to the foreground is the best moment to drain the
            // outbox: the watch is awake and usually has its phone or Wi-Fi.
            if phase == .active {
                model.refreshPairing()
                Task {
                    await model.flushQueue()
                    await model.refreshInbox()
                }
            }
        }
    }

    // MARK: - States

    private var idle: some View {
        VStack(spacing: 10) {
            ZStack {
                Circle()
                    .fill(Color.accentColor.opacity(0.18))
                    .frame(width: 92, height: 92)
                Image(systemName: "mic.fill")
                    .font(.system(size: 38, weight: .semibold))
                    .foregroundStyle(Color.accentColor)
            }
            // Double Tap on Ultra 2 / Series 9 and later: pinch twice and the
            // capture starts without touching the screen or the other hand.
            .handGestureShortcut(.primaryAction)

            Text(model.isPaired ? "Tap and speak" : "Not paired")
                .font(.footnote)
                .foregroundStyle(.secondary)

            if model.queueDepth > 0 {
                Label("\(model.queueDepth) waiting", systemImage: "tray.full.fill")
                    .font(.caption2)
                    .foregroundStyle(.orange)
            }
        }
    }

    private var listening: some View {
        VStack(spacing: 12) {
            WaveformView(level: model.speech.level)
                .frame(height: 44)

            Text(model.speech.transcript.isEmpty ? "Listening…" : model.speech.transcript)
                .font(.system(size: 17, weight: .medium, design: .rounded))
                .multilineTextAlignment(.center)
                .lineLimit(4)
                .minimumScaleFactor(0.7)
                .foregroundStyle(model.speech.transcript.isEmpty ? .secondary : .primary)
                .animation(.easeOut(duration: 0.12), value: model.speech.transcript)

            Text("Pause when you're done")
                .font(.caption2)
                .foregroundStyle(.tertiary)
        }
        .padding(.horizontal, 8)
    }

    private func sending(transcript: String, preview: CaptureIntent) -> some View {
        VStack(spacing: 10) {
            Image(systemName: preview.icon)
                .font(.system(size: 30, weight: .semibold))
                .foregroundStyle(Color.accentColor)
                .symbolEffect(.pulse)
            Text(transcript)
                .font(.footnote)
                .multilineTextAlignment(.center)
                .lineLimit(3)
                .foregroundStyle(.secondary)
            ProgressView().controlSize(.mini)
        }
        .padding(.horizontal, 10)
    }

    private func confirmed(_ result: CaptureResult) -> some View {
        VStack(spacing: 8) {
            Image(systemName: result.intent.icon)
                .font(.system(size: 32, weight: .semibold))
                .foregroundStyle(.green)
                .symbolEffect(.bounce)

            Text(result.title.isEmpty ? result.summary : result.title)
                .font(.system(size: 16, weight: .semibold, design: .rounded))
                .multilineTextAlignment(.center)
                .lineLimit(3)
                .minimumScaleFactor(0.75)

            if let dueAt = result.dueAt {
                Label(dueAt.formatted(.relative(presentation: .named)), systemImage: "clock")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }

            Text(result.status == "PARTIAL" ? "Sent (some channels failed)" : "Sent to Hermes")
                .font(.caption2)
                .foregroundStyle(result.status == "PARTIAL" ? .orange : .green)
        }
        .padding(.horizontal, 10)
    }

    private func queued(transcript: String, preview: CaptureIntent) -> some View {
        VStack(spacing: 8) {
            Image(systemName: "tray.and.arrow.down.fill")
                .font(.system(size: 30, weight: .semibold))
                .foregroundStyle(.orange)
            Text(transcript)
                .font(.footnote)
                .multilineTextAlignment(.center)
                .lineLimit(3)
            Text("Saved — will send when back online")
                .font(.caption2)
                .foregroundStyle(.orange)
        }
        .padding(.horizontal, 10)
    }

    private func failed(_ message: String) -> some View {
        VStack(spacing: 8) {
            Image(systemName: "exclamationmark.triangle.fill")
                .font(.system(size: 28))
                .foregroundStyle(.red)
            Text(message)
                .font(.footnote)
                .multilineTextAlignment(.center)
                .lineLimit(4)
                .minimumScaleFactor(0.8)
        }
        .padding(.horizontal, 10)
    }

    // A subtle tint shift is the peripheral-vision cue that the mic is hot.
    private var background: some View {
        LinearGradient(
            colors: model.phase == .listening
                ? [Color.accentColor.opacity(0.32), .black]
                : [Color.black, Color.black],
            startPoint: .top,
            endPoint: .bottom
        )
        .animation(.easeInOut(duration: 0.3), value: model.phase == .listening)
    }
}

/// Live input level. Not decoration: it is the only proof the microphone is
/// actually picking the user up before they have said anything transcribable.
struct WaveformView: View {
    let level: Double
    private let bars = 5

    var body: some View {
        HStack(spacing: 4) {
            ForEach(0..<bars, id: \.self) { index in
                Capsule()
                    .fill(Color.accentColor)
                    .frame(width: 5, height: height(for: index))
                    .animation(.easeOut(duration: 0.1), value: level)
            }
        }
    }

    private func height(for index: Int) -> CGFloat {
        // Centre bars react most, which reads as a voice rather than a meter.
        let distanceFromCentre = abs(Double(index) - Double(bars - 1) / 2)
        let weight = 1.0 - (distanceFromCentre / Double(bars))
        return 8 + CGFloat(level * weight * 64)
    }
}
