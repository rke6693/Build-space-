import Foundation
import os
#if canImport(WidgetKit)
import WidgetKit
#endif

/// Durable outbox.
///
/// The design rule for the whole app: **the user spoke, so the capture must not
/// be lost.** Every capture is written to disk before any network call is
/// attempted, survives app termination and reboot, and is only removed once the
/// relay has acknowledged it. A watch in a tunnel, on a plane, or out of range
/// of its phone just accumulates and flushes later.
///
/// An actor rather than a lock: flushes can be kicked off from the UI, from a
/// background refresh task, and from connectivity changes at the same time, and
/// none of them may interleave a read-modify-write of the file.
public actor CaptureQueue {
    public static let shared = CaptureQueue()

    private let logger = Logger(subsystem: "com.hermes.relay", category: "queue")
    private var pending: [Capture] = []
    private var loaded = false
    private var flushing = false

    /// Bounded so a pathological loop cannot fill the watch's disk. Oldest are
    /// dropped first: a three-day-old "remind me in 5 minutes" has expired
    /// anyway, whereas the capture from ten seconds ago has not.
    private let maxDepth = 200

    /// Lives in the shared App Group container, not the app's own sandbox, so
    /// the complication reads the same outbox the app writes. Falls back to
    /// Application Support if the group is unavailable (e.g. an unsigned build),
    /// where the app still works — the complication just shows a stale count.
    private let fileURL: URL = {
        let group = Bundle.main.object(forInfoDictionaryKey: "HermesAppGroup") as? String
            ?? "group.com.hermes.relay"
        if let shared = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: group) {
            return shared.appendingPathComponent("hermes-outbox.json")
        }
        let base = (try? FileManager.default.url(
            for: .applicationSupportDirectory,
            in: .userDomainMask,
            appropriateFor: nil,
            create: true
        )) ?? URL.temporaryDirectory
        return base.appendingPathComponent("hermes-outbox.json")
    }()

    public var depth: Int {
        get async {
            await loadIfNeeded()
            return pending.count
        }
    }

    public var contents: [Capture] {
        get async {
            await loadIfNeeded()
            return pending
        }
    }

    /// Persists the capture, then returns. Never throws: if the disk write
    /// fails we still keep it in memory and try to send, because dropping it
    /// here is the one outcome with no recovery.
    public func enqueue(_ capture: Capture) async {
        await loadIfNeeded()
        guard !pending.contains(where: { $0.clientId == capture.clientId }) else { return }
        pending.append(capture)
        if pending.count > maxDepth {
            pending.removeFirst(pending.count - maxDepth)
        }
        persist()
    }

    /// Attempts to deliver everything queued.
    ///
    /// Partial success is normal: the relay answers per capture, so anything it
    /// acknowledged is dropped even if a sibling in the same batch failed.
    @discardableResult
    public func flush(using api: HermesAPI) async -> [CaptureResult] {
        await loadIfNeeded()
        guard !flushing, !pending.isEmpty else { return [] }
        flushing = true
        defer { flushing = false }

        var delivered: [CaptureResult] = []

        // The relay caps a batch at 25; anything more goes in successive chunks
        // so a long backlog still drains in one flush.
        while !pending.isEmpty {
            let batch = Array(pending.prefix(25))
            do {
                let results = try await api.send(batch)
                let acknowledged = Set(results.map(\.clientId))
                pending.removeAll { acknowledged.contains($0.clientId) }
                persist()
                delivered.append(contentsOf: results)
            } catch let error as HermesError {
                if error.isRetryable {
                    logger.notice("flush deferred: \(error.localizedDescription, privacy: .public)")
                } else {
                    // A 4xx on the whole batch means these captures will never
                    // be accepted (malformed, or the device was revoked).
                    // Keeping them would retry forever on every wrist raise.
                    logger.error("dropping \(batch.count) unsendable captures: \(error.localizedDescription, privacy: .public)")
                    let stuck = Set(batch.map(\.clientId))
                    pending.removeAll { stuck.contains($0.clientId) }
                    persist()
                }
                break
            } catch {
                logger.notice("flush deferred: \(error.localizedDescription, privacy: .public)")
                break
            }
        }

        return delivered
    }

    public func clear() {
        pending = []
        persist()
    }

    // MARK: - Persistence

    private func loadIfNeeded() async {
        guard !loaded else { return }
        loaded = true
        guard let data = try? Data(contentsOf: fileURL) else { return }
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        pending = (try? decoder.decode([Capture].self, from: data)) ?? []
    }

    private func persist() {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        do {
            let data = try encoder.encode(pending)
            // Atomic: a half-written outbox after a crash would lose everything,
            // not just the capture being added.
            try data.write(to: fileURL, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
        } catch {
            logger.error("outbox write failed: \(error.localizedDescription, privacy: .public)")
        }
        #if canImport(WidgetKit) && os(watchOS)
        // The complication shows the queue depth; refresh it whenever it moves.
        WidgetCenter.shared.reloadTimelines(ofKind: "HermesCapture")
        #endif
    }
}
