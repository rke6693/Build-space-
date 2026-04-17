//
//  MilestoneEngine.swift
//  KoruCore
//
//  Detects and generates celebratory milestones based on score history.
//  Pure Swift, fully deterministic, no side effects. Returns newly
//  achieved milestones that haven't been shown to the user yet.
//

import Foundation

// MARK: - Models

public enum MilestoneKind: String, Codable, Hashable, Sendable, CaseIterable {
    case firstScore
    case personalBest
    case streakDays7
    case streakDays14
    case streakDays30
    case perfectWeek
    case consistentMonth
    case recoveryBounce
    case centurion
}

public struct Milestone: Codable, Hashable, Sendable, Identifiable {
    public let id: String
    public let kind: MilestoneKind
    public let text: String
    public let emoji: String
    public let achieved: Date

    public init(kind: MilestoneKind, text: String, emoji: String, achieved: Date) {
        self.id = kind.rawValue + "_" + ISO8601DateFormatter().string(from: achieved)
        self.kind = kind
        self.text = text
        self.emoji = emoji
        self.achieved = achieved
    }
}

// MARK: - Engine

public struct MilestoneEngine: Sendable {

    /// Check the current score and history for newly achieved milestones.
    /// Returns only milestones whose IDs are not in `shownIDs`.
    public static func check(
        score: WellnessScore,
        history: [WellnessScore],
        shownIDs: Set<String>
    ) -> [Milestone] {
        let now = score.computedAt
        let sorted = history.sorted { $0.day < $1.day }

        var candidates: [Milestone] = []

        candidates += checkFirstScore(sorted, now: now)
        candidates += checkPersonalBest(score: score, history: sorted, now: now)
        candidates += checkStreaks(history: sorted, now: now)
        candidates += checkPerfectWeek(history: sorted, now: now)
        candidates += checkConsistentMonth(history: sorted, now: now)
        candidates += checkRecoveryBounce(score: score, history: sorted, now: now)
        candidates += checkCenturion(score: score, now: now)

        // Filter out already-shown milestones.
        return candidates.filter { !shownIDs.contains($0.id) }
    }

    // MARK: - Detectors

    /// First score ever recorded.
    private static func checkFirstScore(
        _ history: [WellnessScore],
        now: Date
    ) -> [Milestone] {
        guard history.count == 1 else { return [] }
        return [Milestone(
            kind: .firstScore,
            text: "Your first Koru score! Welcome to the journey.",
            emoji: "🌱",
            achieved: now
        )]
    }

    /// New personal best score.
    private static func checkPersonalBest(
        score: WellnessScore,
        history: [WellnessScore],
        now: Date
    ) -> [Milestone] {
        let prior = history.filter { !Calendar.current.isDate($0.day, inSameDayAs: score.day) }
        guard !prior.isEmpty else { return [] }
        let priorMax = prior.map(\.value).max() ?? 0
        guard score.value > priorMax && score.value >= 60 else { return [] }
        return [Milestone(
            kind: .personalBest,
            text: "New personal best: \(score.value)! You're peaking.",
            emoji: "🏆",
            achieved: now
        )]
    }

    /// Consecutive-day streaks: 7, 14, and 30 days.
    private static func checkStreaks(
        history: [WellnessScore],
        now: Date
    ) -> [Milestone] {
        let streak = consecutiveDays(from: history)
        var results: [Milestone] = []

        if streak >= 7 {
            results.append(Milestone(
                kind: .streakDays7,
                text: "7-day streak! Consistency is the real superpower.",
                emoji: "🔥",
                achieved: now
            ))
        }
        if streak >= 14 {
            results.append(Milestone(
                kind: .streakDays14,
                text: "14 days strong. Your baseline is fully personalized now.",
                emoji: "⚡",
                achieved: now
            ))
        }
        if streak >= 30 {
            results.append(Milestone(
                kind: .streakDays30,
                text: "30 days of Koru. You've built a real wellness habit.",
                emoji: "💎",
                achieved: now
            ))
        }

        return results
    }

    /// Perfect week: every day in the last 7 scored 70+.
    private static func checkPerfectWeek(
        history: [WellnessScore],
        now: Date
    ) -> [Milestone] {
        guard history.count >= 7 else { return [] }
        let last7 = Array(history.suffix(7))
        // Verify they span exactly 7 consecutive calendar days.
        guard consecutiveDays(from: last7) >= 7 else { return [] }
        guard last7.allSatisfy({ $0.value >= 70 }) else { return [] }
        return [Milestone(
            kind: .perfectWeek,
            text: "Perfect week! Every day scored 70+.",
            emoji: "✨",
            achieved: now
        )]
    }

    /// Consistent month: scores varied less than 10 points over 30 days.
    private static func checkConsistentMonth(
        history: [WellnessScore],
        now: Date
    ) -> [Milestone] {
        guard history.count >= 28 else { return [] }
        let last30 = Array(history.suffix(30))
        guard consecutiveDays(from: last30) >= 28 else { return [] }
        let values = last30.map(\.value)
        guard let maxV = values.max(), let minV = values.min() else { return [] }
        guard (maxV - minV) < 10 else { return [] }
        return [Milestone(
            kind: .consistentMonth,
            text: "Your scores varied less than 10 points this month. Rock-solid.",
            emoji: "🪨",
            achieved: now
        )]
    }

    /// Recovery bounce: score jumped 20+ from the low point in history.
    private static func checkRecoveryBounce(
        score: WellnessScore,
        history: [WellnessScore],
        now: Date
    ) -> [Milestone] {
        // Need at least 3 days to detect a dip and bounce.
        guard history.count >= 3 else { return [] }
        let recent = Array(history.suffix(7))
        guard let minScore = recent.map(\.value).min() else { return [] }
        // The current score must be the bounce, and the low must not be today.
        let lowIsNotToday = recent
            .filter { !Calendar.current.isDate($0.day, inSameDayAs: score.day) }
            .map(\.value)
            .min() ?? minScore
        guard score.value >= lowIsNotToday + 20 else { return [] }
        return [Milestone(
            kind: .recoveryBounce,
            text: "Bounced back! Score jumped 20+ from your low point.",
            emoji: "🚀",
            achieved: now
        )]
    }

    /// Centurion: a perfect 100 score.
    private static func checkCenturion(
        score: WellnessScore,
        now: Date
    ) -> [Milestone] {
        guard score.value == 100 else { return [] }
        return [Milestone(
            kind: .centurion,
            text: "100! A perfect Koru score. Legendary.",
            emoji: "👑",
            achieved: now
        )]
    }

    // MARK: - Helpers

    /// Count consecutive calendar days with scores, working backwards
    /// from the most recent day.
    private static func consecutiveDays(from scores: [WellnessScore]) -> Int {
        let calendar = Calendar.current
        let sorted = scores.sorted { $0.day > $1.day }
        guard let first = sorted.first else { return 0 }
        var count = 1
        var previousDay = calendar.startOfDay(for: first.day)
        for score in sorted.dropFirst() {
            let day = calendar.startOfDay(for: score.day)
            let expected = calendar.date(byAdding: .day, value: -1, to: previousDay)!
            if calendar.isDate(day, inSameDayAs: expected) {
                count += 1
                previousDay = day
            } else {
                break
            }
        }
        return count
    }
}
