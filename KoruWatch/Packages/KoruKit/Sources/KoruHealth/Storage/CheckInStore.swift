//
//  CheckInStore.swift
//  KoruHealth
//
//  Actor-based persistence for check-in history. Each CheckInRecord
//  captures the user's subjective mood, energy, and stress plus the
//  objective score at the time of logging. Stored in the same App Group
//  container as ScoreHistoryStore with FileProtection.complete.
//

import Foundation
import KoruCore

// MARK: - Record model

public struct CheckInRecord: Codable, Hashable, Sendable, Identifiable {
    public let id: UUID
    public let date: Date
    /// 0–4 subjective mood rating.
    public let mood: Int
    /// 0–4 subjective energy rating.
    public let energy: Int
    /// 0–4 subjective stress rating.
    public let stress: Int
    /// Optional freeform note the user can attach.
    public let note: String?
    /// The overall WellnessScore value when this check-in was logged.
    public let scoreAtTime: Int?

    public init(
        id: UUID = UUID(),
        date: Date = Date(),
        mood: Int,
        energy: Int,
        stress: Int,
        note: String? = nil,
        scoreAtTime: Int? = nil
    ) {
        self.id = id
        self.date = date
        self.mood = mood.clamped(to: 0...4)
        self.energy = energy.clamped(to: 0...4)
        self.stress = stress.clamped(to: 0...4)
        self.note = note
        self.scoreAtTime = scoreAtTime
    }
}

// MARK: - Store

public actor CheckInStore {

    private let fileURL: URL

    public init() {
        let base: URL
        #if os(watchOS) || os(iOS) || os(macOS)
        if let group = FileManager.default
            .containerURL(forSecurityApplicationGroupIdentifier: ScoreHistoryStore.appGroupIdentifier) {
            base = group
        } else {
            base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first!
        }
        #else
        base = URL(fileURLWithPath: NSTemporaryDirectory())
        #endif
        self.fileURL = base.appendingPathComponent("koru_checkins.json")
    }

    // MARK: - Public API

    /// Append a new check-in record. Trims to the most recent 90 days.
    public func append(_ record: CheckInRecord) throws {
        var all = loadAll()
        all.append(record)
        all.sort { $0.date > $1.date }
        // Trim to 90 days.
        let cutoff = Calendar.current.date(byAdding: .day, value: -90, to: Date()) ?? Date()
        all.removeAll { $0.date < cutoff }
        let data = try JSONEncoder.koru.encode(all)
        try writeProtected(data)
    }

    /// Load all stored check-in records, most recent first.
    public func loadAll() -> [CheckInRecord] {
        guard let data = try? Data(contentsOf: fileURL) else { return [] }
        return (try? JSONDecoder.koru.decode([CheckInRecord].self, from: data)) ?? []
    }

    /// Return check-in records for a specific calendar day.
    public func forDay(_ date: Date) -> [CheckInRecord] {
        let calendar = Calendar.current
        return loadAll().filter { calendar.isDate($0.date, inSameDayAs: date) }
    }

    /// Average mood over the last N days. Returns nil if no records.
    public func averageMood(last days: Int) -> Double? {
        let cutoff = Calendar.current.date(byAdding: .day, value: -days, to: Date()) ?? Date()
        let relevant = loadAll().filter { $0.date >= cutoff }
        guard !relevant.isEmpty else { return nil }
        let sum = relevant.reduce(0) { $0 + $1.mood }
        return Double(sum) / Double(relevant.count)
    }

    // MARK: - Private

    private func writeProtected(_ data: Data) throws {
        try data.write(to: fileURL, options: [.atomic, .completeFileProtection])
    }
}
