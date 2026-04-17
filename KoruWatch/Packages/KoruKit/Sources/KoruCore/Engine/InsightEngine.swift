//
//  InsightEngine.swift
//  KoruCore
//
//  Pure Swift engine that analyzes the last 14 days of WellnessScore
//  history and generates 1–3 personalized insight strings. Fully
//  deterministic and testable — no side effects, no framework imports
//  beyond Foundation.
//

import Foundation

// MARK: - Models

public enum InsightKind: String, Codable, Hashable, Sendable {
    case improvement
    case warning
    case pattern
    case milestone
}

public struct KoruInsight: Codable, Hashable, Sendable, Identifiable {
    public let id: UUID
    public let text: String
    public let kind: InsightKind
    /// 0–1 relevance used for ranking. Higher = more relevant.
    public let relevance: Double

    public init(text: String, kind: InsightKind, relevance: Double) {
        self.id = UUID()
        self.text = text
        self.kind = kind
        self.relevance = relevance.clamped(to: 0...1)
    }
}

// MARK: - Engine

public struct InsightEngine: Sendable {

    public static func analyze(history: [WellnessScore]) -> [KoruInsight] {
        let sorted = history.sorted { $0.day < $1.day }
        guard sorted.count >= 2 else { return [] }

        var candidates: [KoruInsight] = []

        // Run all pattern detectors.
        candidates += detectWeeklyTrend(sorted)
        candidates += detectBestWorstDay(sorted)
        candidates += detectComponentStreak(sorted)
        candidates += detectSleepCorrelation(sorted)
        candidates += detectRecoveryRebound(sorted)
        candidates += detectConsistency(sorted)
        candidates += detectNewHigh(sorted)
        candidates += detectOvertrainingRisk(sorted)

        // Rank by relevance, return top 3.
        let ranked = candidates.sorted { $0.relevance > $1.relevance }
        return Array(ranked.prefix(3))
    }

    // MARK: - Pattern detectors

    /// 1. Weekly trend: compare last 7 days vs prior 7 days.
    private static func detectWeeklyTrend(_ scores: [WellnessScore]) -> [KoruInsight] {
        guard scores.count >= 8 else { return [] }
        let recent = scores.suffix(7)
        let prior = scores.dropLast(7).suffix(7)
        guard !prior.isEmpty else { return [] }
        let recentAvg = Double(recent.reduce(0) { $0 + $1.value }) / Double(recent.count)
        let priorAvg = Double(prior.reduce(0) { $0 + $1.value }) / Double(prior.count)
        guard priorAvg > 0 else { return [] }
        let pctChange = ((recentAvg - priorAvg) / priorAvg) * 100
        let rounded = Int(pctChange.rounded())
        guard abs(rounded) >= 3 else { return [] }
        if rounded > 0 {
            return [KoruInsight(
                text: "Your score is up \(rounded)% vs last week.",
                kind: .improvement,
                relevance: min(1.0, Double(abs(rounded)) / 20.0)
            )]
        } else {
            return [KoruInsight(
                text: "Your score is down \(abs(rounded))% vs last week.",
                kind: .warning,
                relevance: min(1.0, Double(abs(rounded)) / 20.0)
            )]
        }
    }

    /// 2. Best/worst day of week correlation.
    private static func detectBestWorstDay(_ scores: [WellnessScore]) -> [KoruInsight] {
        guard scores.count >= 7 else { return [] }
        let calendar = Calendar.current
        var dayBuckets: [Int: [Int]] = [:] // weekday → values
        for s in scores {
            let wd = calendar.component(.weekday, from: s.day)
            dayBuckets[wd, default: []].append(s.value)
        }
        // Need at least 2 different weekdays with data.
        let averages = dayBuckets.compactMap { (wd, vals) -> (Int, Double)? in
            guard vals.count >= 1 else { return nil }
            return (wd, Double(vals.reduce(0, +)) / Double(vals.count))
        }
        guard averages.count >= 2 else { return [] }
        let best = averages.max(by: { $0.1 < $1.1 })!
        let worst = averages.min(by: { $0.1 < $1.1 })!
        let diff = Int((best.1 - worst.1).rounded())
        guard diff >= 8 else { return [] }
        let bestName = weekdayName(best.0)
        let worstName = weekdayName(worst.0)
        return [KoruInsight(
            text: "\(worstName)s average \(diff) points lower than \(bestName)s.",
            kind: .pattern,
            relevance: min(0.9, Double(diff) / 25.0)
        )]
    }

    /// 3. Component streak detection (3+ days improving).
    private static func detectComponentStreak(_ scores: [WellnessScore]) -> [KoruInsight] {
        guard scores.count >= 3 else { return [] }
        let last4 = Array(scores.suffix(4))
        var insights: [KoruInsight] = []
        for kind in ComponentKind.allCases {
            let values = last4.compactMap { score -> Int? in
                score.components.first(where: { $0.kind == kind && $0.isAvailable })?.value
            }
            guard values.count >= 3 else { continue }
            // Check for increasing streak.
            let tail = values.suffix(3)
            let arr = Array(tail)
            if arr.count == 3 && arr[0] < arr[1] && arr[1] < arr[2] {
                insights.append(KoruInsight(
                    text: "Your \(kind.label) has improved 3 days in a row.",
                    kind: .improvement,
                    relevance: 0.75
                ))
            }
            // Check for decreasing streak.
            if arr.count == 3 && arr[0] > arr[1] && arr[1] > arr[2] {
                insights.append(KoruInsight(
                    text: "Your \(kind.label) has declined 3 days in a row.",
                    kind: .warning,
                    relevance: 0.7
                ))
            }
        }
        // Return the most relevant one.
        return Array(insights.sorted { $0.relevance > $1.relevance }.prefix(1))
    }

    /// 4. Sleep–score correlation.
    private static func detectSleepCorrelation(_ scores: [WellnessScore]) -> [KoruInsight] {
        guard scores.count >= 5 else { return [] }
        // Compare scores on days where sleep component is above vs below 60.
        var highSleepScores: [Int] = []
        var lowSleepScores: [Int] = []
        for s in scores {
            guard let sleep = s.components.first(where: { $0.kind == .sleep && $0.isAvailable }) else { continue }
            if sleep.value >= 60 {
                highSleepScores.append(s.value)
            } else {
                lowSleepScores.append(s.value)
            }
        }
        guard highSleepScores.count >= 2 && lowSleepScores.count >= 2 else { return [] }
        let highAvg = Double(highSleepScores.reduce(0, +)) / Double(highSleepScores.count)
        let lowAvg = Double(lowSleepScores.reduce(0, +)) / Double(lowSleepScores.count)
        let diff = Int((highAvg - lowAvg).rounded())
        guard diff >= 8 else { return [] }
        return [KoruInsight(
            text: "Good sleep nights correlate with +\(diff) score points.",
            kind: .pattern,
            relevance: min(0.85, Double(diff) / 20.0)
        )]
    }

    /// 5. Recovery rebound after overtraining.
    private static func detectRecoveryRebound(_ scores: [WellnessScore]) -> [KoruInsight] {
        guard scores.count >= 3 else { return [] }
        let last3 = Array(scores.suffix(3))
        guard last3.count == 3 else { return [] }
        let a = last3[0].value
        let b = last3[1].value
        let c = last3[2].value
        // Pattern: drop then rebound (a >= 60, b drops >15, c recovers >10 above b).
        if a >= 60 && b < a - 15 && c > b + 10 {
            let calendar = Calendar.current
            let dayName: String
            if let wd = calendar.dateComponents([.weekday], from: last3[1].day).weekday {
                dayName = weekdayName(wd)
            } else {
                dayName = "the dip"
            }
            return [KoruInsight(
                text: "Score rebounded after \(dayName)'s drop.",
                kind: .improvement,
                relevance: 0.8
            )]
        }
        return []
    }

    /// 6. Consistency detection (low variance = milestone).
    private static func detectConsistency(_ scores: [WellnessScore]) -> [KoruInsight] {
        guard scores.count >= 7 else { return [] }
        let last7 = scores.suffix(7).map(\.value)
        let avg = Double(last7.reduce(0, +)) / Double(last7.count)
        let variance = last7.map { pow(Double($0) - avg, 2) }.reduce(0, +) / Double(last7.count)
        let stdDev = variance.squareRoot()
        // Low standard deviation + decent average = consistency milestone.
        guard stdDev < 5 && avg >= 65 else { return [] }
        return [KoruInsight(
            text: "Impressive consistency — your score has stayed within \(Int(stdDev.rounded() * 2)) points all week.",
            kind: .milestone,
            relevance: 0.7
        )]
    }

    /// 7. New personal high in the window.
    private static func detectNewHigh(_ scores: [WellnessScore]) -> [KoruInsight] {
        guard scores.count >= 5 else { return [] }
        guard let latest = scores.last else { return [] }
        let prior = scores.dropLast()
        let priorMax = prior.map(\.value).max() ?? 0
        guard latest.value > priorMax && latest.value >= 75 else { return [] }
        return [KoruInsight(
            text: "New high score of \(latest.value) — your best in \(scores.count) days!",
            kind: .milestone,
            relevance: 0.9
        )]
    }

    /// 8. Overtraining risk (workout load spiking while score drops).
    private static func detectOvertrainingRisk(_ scores: [WellnessScore]) -> [KoruInsight] {
        guard scores.count >= 3 else { return [] }
        let last3 = Array(scores.suffix(3))
        // Check if workout component is high while overall score is declining.
        let workoutValues = last3.compactMap { s -> Int? in
            s.components.first(where: { $0.kind == .workoutLoad && $0.isAvailable })?.value
        }
        let scoreValues = last3.map(\.value)
        guard workoutValues.count == 3 && scoreValues.count == 3 else { return [] }
        // Workout load high (>65) every day, but total score is declining.
        let allHighLoad = workoutValues.allSatisfy { $0 > 65 }
        let declining = scoreValues[0] > scoreValues[1] && scoreValues[1] > scoreValues[2]
        guard allHighLoad && declining else { return [] }
        let drop = scoreValues[0] - scoreValues[2]
        guard drop >= 8 else { return [] }
        return [KoruInsight(
            text: "Heavy training for 3 days while your score dropped \(drop) points. Consider a recovery day.",
            kind: .warning,
            relevance: 0.85
        )]
    }

    // MARK: - Helpers

    private static func weekdayName(_ weekday: Int) -> String {
        let names = ["", "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
        guard weekday >= 1 && weekday <= 7 else { return "Unknown" }
        return names[weekday]
    }
}
