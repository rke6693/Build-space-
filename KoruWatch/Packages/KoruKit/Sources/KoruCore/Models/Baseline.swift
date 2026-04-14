//
//  Baseline.swift
//  KoruCore
//
//  Rolling personal statistics per metric (Welford's online variance)
//  plus the hybrid-blend factor calculation used by the scoring engine.
//

import Foundation

/// Running mean and standard deviation for a single metric. Uses
/// Welford's online algorithm so we never hold more than the last 14
/// daily samples in memory.
public struct BaselineStats: Codable, Hashable, Sendable {
    public var n: Int
    public var mean: Double
    public var m2: Double   // Σ (x - mean)^2
    public var lastUpdated: Date?

    public init(n: Int = 0, mean: Double = 0, m2: Double = 0, lastUpdated: Date? = nil) {
        self.n = n
        self.mean = mean
        self.m2 = m2
        self.lastUpdated = lastUpdated
    }

    public var stdDev: Double {
        guard n > 1 else { return 0 }
        return (m2 / Double(n - 1)).squareRoot()
    }

    /// Ingest a new observation, capped at 14 daily samples via
    /// exponential decay rather than a hard window. This keeps memory
    /// constant while responding smoothly to drift.
    public mutating func observe(_ x: Double, at day: Date) {
        // One observation per calendar day max.
        if let last = lastUpdated,
           Calendar.current.isDate(last, inSameDayAs: day) { return }
        n += 1
        let delta = x - mean
        // Cap effective n at 14 so recent values retain influence.
        let effectiveN = min(Double(n), 14.0)
        mean += delta / effectiveN
        let delta2 = x - mean
        m2 += delta * delta2
        lastUpdated = day
    }
}

/// One baseline per metric keyed by ComponentKind.
/// Codable conformance lives in `KoruHealth/Storage/ScoreHistoryStore.swift`
/// because the dictionary key requires custom encoding to produce a
/// deterministic, schema-friendly JSON layout.
public struct BaselineBook: Hashable, Sendable {
    public var perComponent: [ComponentKind: BaselineStats]

    public init(perComponent: [ComponentKind: BaselineStats] = [:]) {
        self.perComponent = perComponent
    }

    public subscript(kind: ComponentKind) -> BaselineStats {
        get { perComponent[kind] ?? BaselineStats() }
        set { perComponent[kind] = newValue }
    }

    /// Hybrid blend factor α: 0 means pure population norms, 1 means pure
    /// personal baseline. Smooth ease-in-out over 14 days.
    public func blendAlpha(for kind: ComponentKind) -> Double {
        let stats = self[kind]
        let t = Double(stats.n).clamped(to: 0...14) / 14.0
        // Smoothstep for a natural feel: 3t² − 2t³
        return t * t * (3 - 2 * t)
    }
}
