//
//  WellnessScore.swift
//  KoruCore
//
//  The top-level value object returned by ScoringEngine.compute().
//  Fully Sendable, Codable, and free of any Apple framework imports so
//  it can travel across the app, the widget extension, tests, and
//  persistent storage with no ceremony.
//

import Foundation

/// A single day's Koru wellness score.
///
/// - `value`: integer 0–100, the user-facing number shown in the ring.
/// - `band`: derived from `value` for quick visual theming.
/// - `trend`: signed delta vs the 7-day trailing average.
/// - `components`: the 10 contributor components, each 0–100.
/// - `confidence`: 0–1 measure of how trustworthy this score is given
///   how much data and baseline maturity are available. Surfaces in the
///   UI as a subtle dim when < 1.
/// - `computedAt`: UTC instant of computation; widget relevance uses this.
public struct WellnessScore: Codable, Hashable, Sendable, Identifiable {
    public var id: Date { day }

    /// Calendar day (00:00 in user's current calendar) this score represents.
    public let day: Date
    public let value: Int
    public let band: ScoreBand
    public let trend: Int
    public let components: [ScoreComponent]
    public let confidence: Double
    public let computedAt: Date

    public init(
        day: Date,
        value: Int,
        band: ScoreBand,
        trend: Int,
        components: [ScoreComponent],
        confidence: Double,
        computedAt: Date
    ) {
        self.day        = day
        self.value      = value.clamped(to: 0...100)
        self.band       = band
        self.trend      = trend
        self.components = components
        self.confidence = confidence.clamped(to: 0...1)
        self.computedAt = computedAt
    }

    /// Single-word status derived from the band, used under the numeral.
    public var statusWord: String { band.statusWord }

    /// Top `n` contributors (absolute deviation from baseline, descending).
    public func topContributors(limit: Int = 3) -> [ScoreComponent] {
        components
            .filter { $0.isAvailable }
            .sorted { abs($0.zScore) > abs($1.zScore) }
            .prefix(limit)
            .map { $0 }
    }
}
