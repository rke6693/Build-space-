//
//  ScoreHistoryStore.swift
//  KoruHealth
//
//  File-based persistence for the 30-day rolling WellnessScore history
//  and the live BaselineBook. Stored in an App Group container so the
//  widget extension can read the same data. All writes use
//  FileProtection.complete — nothing decodable before unlock.
//

import Foundation
import KoruCore

public actor ScoreHistoryStore {

    public static let appGroupIdentifier = "group.app.koru.shared"

    private let fileManager = FileManager.default
    private let historyURL: URL
    private let baselineURL: URL

    public init() {
        let base: URL
        #if os(watchOS) || os(iOS) || os(macOS)
        if let group = FileManager.default
            .containerURL(forSecurityApplicationGroupIdentifier: Self.appGroupIdentifier) {
            base = group
        } else {
            base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first!
        }
        #else
        base = URL(fileURLWithPath: NSTemporaryDirectory())
        #endif
        self.historyURL  = base.appendingPathComponent("koru_history.json")
        self.baselineURL = base.appendingPathComponent("koru_baseline.json")
    }

    // MARK: - History

    public func loadHistory() -> [WellnessScore] {
        guard let data = try? Data(contentsOf: historyURL) else { return [] }
        return (try? JSONDecoder.koru.decode([WellnessScore].self, from: data)) ?? []
    }

    public func append(_ score: WellnessScore) throws {
        var history = loadHistory()
        // Replace existing score for the same calendar day.
        history.removeAll { Calendar.current.isDate($0.day, inSameDayAs: score.day) }
        history.append(score)
        history.sort { $0.day > $1.day }
        if history.count > 30 {
            history = Array(history.prefix(30))
        }
        let data = try JSONEncoder.koru.encode(history)
        try writeProtected(data, to: historyURL)
    }

    // MARK: - Baselines

    public func loadBaselines() -> BaselineBook {
        guard let data = try? Data(contentsOf: baselineURL) else { return BaselineBook() }
        return (try? JSONDecoder.koru.decode(BaselineBook.self, from: data)) ?? BaselineBook()
    }

    public func save(baselines: BaselineBook) throws {
        let data = try JSONEncoder.koru.encode(baselines)
        try writeProtected(data, to: baselineURL)
    }

    // MARK: - Protected write

    private func writeProtected(_ data: Data, to url: URL) throws {
        // Atomic + complete file protection.
        try data.write(to: url, options: [.atomic, .completeFileProtection])
    }
}

// MARK: - BaselineBook Codable helper
//
// ComponentKind is a CodingKey-able raw enum, but a dictionary keyed
// by it doesn't Codable directly — we encode as an array of {kind, stats}.
//

extension BaselineBook: Codable {
    private struct Entry: Codable {
        let kind: ComponentKind
        let stats: BaselineStats
    }

    public init(from decoder: Decoder) throws {
        var container = try decoder.unkeyedContainer()
        var dict: [ComponentKind: BaselineStats] = [:]
        while !container.isAtEnd {
            let e = try container.decode(Entry.self)
            dict[e.kind] = e.stats
        }
        self.perComponent = dict
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.unkeyedContainer()
        for (k, v) in perComponent.sorted(by: { $0.key.rawValue < $1.key.rawValue }) {
            try container.encode(Entry(kind: k, stats: v))
        }
    }
}

// MARK: - JSON configuration

extension JSONEncoder {
    static let koru: JSONEncoder = {
        let enc = JSONEncoder()
        enc.dateEncodingStrategy = .iso8601
        enc.outputFormatting = [.sortedKeys]
        return enc
    }()
}

extension JSONDecoder {
    static let koru: JSONDecoder = {
        let dec = JSONDecoder()
        dec.dateDecodingStrategy = .iso8601
        return dec
    }()
}
