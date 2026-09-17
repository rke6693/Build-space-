import AVFoundation
import Foundation
import Speech
import os

/// Live speech-to-text on the watch.
///
/// Two things matter here and drive every decision below:
///
/// 1. **On-device where possible.** `requiresOnDeviceRecognition` keeps the
///    audio on the watch — nothing spoken into this app is uploaded as audio,
///    only the resulting text, and only to the user's own relay. It also means
///    capture works with no signal at all.
/// 2. **The user should never have to press stop.** A capture ends when they
///    stop talking. The silence timer below is what makes it a one-button app
///    rather than a two-button one.
@MainActor
final class SpeechRecognizer: ObservableObject {
    enum Failure: LocalizedError {
        case permissionDenied
        case unavailable
        case noSpeech
        case engine(String)

        var errorDescription: String? {
            switch self {
            case .permissionDenied: "Microphone or speech access is off"
            case .unavailable: "Dictation is unavailable right now"
            case .noSpeech: "Didn't catch that"
            case let .engine(message): message
            }
        }
    }

    @Published private(set) var transcript: String = ""
    @Published private(set) var isListening = false
    /// 0...1, smoothed, for the waveform. Purely cosmetic but it is the only
    /// signal that the microphone is actually live.
    @Published private(set) var level: Double = 0

    private let logger = Logger(subsystem: "com.hermes.relay", category: "speech")
    private let recognizer = SFSpeechRecognizer(locale: Locale.current) ?? SFSpeechRecognizer()
    private let audioEngine = AVAudioEngine()
    private var request: SFSpeechAudioBufferRecognitionRequest?
    private var task: SFSpeechRecognitionTask?
    private var silenceTimer: Timer?
    private var hardStopTimer: Timer?
    private var onFinish: ((Result<String, Failure>) -> Void)?

    /// How long a pause ends the capture. Short enough to feel instant, long
    /// enough to survive someone thinking mid-sentence.
    private let silenceWindow: TimeInterval = 1.6
    /// Absolute ceiling, so a stuck session cannot drain the battery.
    private let maxDuration: TimeInterval = 60

    // MARK: - Permissions

    static func requestAuthorization() async -> Bool {
        let speech = await withCheckedContinuation { continuation in
            SFSpeechRecognizer.requestAuthorization { continuation.resume(returning: $0) }
        }
        guard speech == .authorized else { return false }

        return await withCheckedContinuation { continuation in
            AVAudioApplication.requestRecordPermission { continuation.resume(returning: $0) }
        }
    }

    // MARK: - Capture

    func start(onFinish: @escaping (Result<String, Failure>) -> Void) {
        guard !isListening else { return }
        self.onFinish = onFinish
        transcript = ""
        level = 0

        guard let recognizer, recognizer.isAvailable else {
            finish(.failure(.unavailable))
            return
        }

        do {
            try configureSession()
        } catch {
            finish(.failure(.engine(error.localizedDescription)))
            return
        }

        let request = SFSpeechAudioBufferRecognitionRequest()
        request.shouldReportPartialResults = true
        // Falls back to the server recognizer only if this device/locale has no
        // on-device model installed.
        request.requiresOnDeviceRecognition = recognizer.supportsOnDeviceRecognition
        request.taskHint = .dictation
        if #available(watchOS 10.0, *) {
            request.addsPunctuation = true
        }
        self.request = request

        let input = audioEngine.inputNode
        let format = input.outputFormat(forBus: 0)
        input.installTap(onBus: 0, bufferSize: 1024, format: format) { [weak self] buffer, _ in
            request.append(buffer)
            self?.updateLevel(from: buffer)
        }

        audioEngine.prepare()
        do {
            try audioEngine.start()
        } catch {
            cleanup()
            finish(.failure(.engine(error.localizedDescription)))
            return
        }

        isListening = true
        Haptics.listening()
        armHardStop()

        task = recognizer.recognitionTask(with: request) { [weak self] result, error in
            guard let self else { return }
            Task { @MainActor in
                if let result {
                    self.transcript = result.bestTranscription.formattedString
                    // Any new speech resets the countdown to "they're done".
                    self.armSilenceTimer()
                    if result.isFinal { self.stop() }
                }
                if error != nil {
                    // A recognizer error after we already have words is not a
                    // failure — it usually means the session was torn down
                    // right as it finalized. Keep what we heard.
                    if self.transcript.isEmpty {
                        self.abort(.unavailable)
                    } else {
                        self.stop()
                    }
                }
            }
        }
    }

    /// Ends the capture and reports whatever was heard.
    func stop() {
        guard isListening else { return }
        let heard = transcript.trimmingCharacters(in: .whitespacesAndNewlines)
        cleanup()
        finish(heard.isEmpty ? .failure(.noSpeech) : .success(heard))
    }

    /// Ends the capture and discards it.
    func cancel() {
        guard isListening else { return }
        cleanup()
        onFinish = nil
    }

    private func abort(_ failure: Failure) {
        cleanup()
        finish(.failure(failure))
    }

    // MARK: - Internals

    private func configureSession() throws {
        let session = AVAudioSession.sharedInstance()
        // .measurement keeps the system's own processing out of the way of the
        // recognizer; .duckOthers so a podcast does not drown out dictation.
        try session.setCategory(.playAndRecord, mode: .measurement, options: [.duckOthers])
        try session.setActive(true, options: .notifyOthersOnDeactivation)
    }

    private func armSilenceTimer() {
        silenceTimer?.invalidate()
        silenceTimer = Timer.scheduledTimer(withTimeInterval: silenceWindow, repeats: false) { [weak self] _ in
            Task { @MainActor in self?.stop() }
        }
    }

    private func armHardStop() {
        hardStopTimer?.invalidate()
        hardStopTimer = Timer.scheduledTimer(withTimeInterval: maxDuration, repeats: false) { [weak self] _ in
            Task { @MainActor in self?.stop() }
        }
    }

    nonisolated private func updateLevel(from buffer: AVAudioPCMBuffer) {
        guard let channel = buffer.floatChannelData?[0] else { return }
        let frames = Int(buffer.frameLength)
        guard frames > 0 else { return }

        var sum: Float = 0
        for index in 0..<frames {
            sum += channel[index] * channel[index]
        }
        let rms = sqrt(sum / Float(frames))
        // Map RMS onto something that looks alive at speaking volume.
        let normalized = min(1, Double(rms) * 12)
        Task { @MainActor in
            // Exponential smoothing: raw RMS jitters far too fast to render.
            self.level = self.level * 0.7 + normalized * 0.3
        }
    }

    private func cleanup() {
        silenceTimer?.invalidate()
        silenceTimer = nil
        hardStopTimer?.invalidate()
        hardStopTimer = nil

        if audioEngine.isRunning {
            audioEngine.stop()
            audioEngine.inputNode.removeTap(onBus: 0)
        }
        request?.endAudio()
        task?.cancel()
        request = nil
        task = nil
        isListening = false
        level = 0

        // Hand the audio session back so music resumes.
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }

    private func finish(_ result: Result<String, Failure>) {
        let callback = onFinish
        onFinish = nil
        callback?(result)
    }
}
