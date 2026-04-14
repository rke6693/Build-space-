//
//  MindfulnessScorer.swift
//  KoruCore
//
//  Behavioural component. Linear from 0 to 10 minutes, then a gentle
//  plateau — 10 minutes is the target daily dose.
//

import Foundation

public enum MindfulnessScorer: ComponentScoring {
    public static let kind: ComponentKind = .mindfulness

    public static func score(
        snapshot: HealthSnapshot,
        baselines _: BaselineBook
    ) -> ScoreComponent {
        let minutes = snapshot.mindfulMinutes ?? 0
        // Unlike the other scorers, 0 minutes is still reported (not
        // "unavailable") because the user may simply not have meditated.
        let raw: Double
        switch minutes {
        case ..<10: raw = (minutes / 10) * 80 + 20
        case 10..<20: raw = 100
        default:     raw = 100  // diminishing returns but no penalty
        }
        let value = Int(raw.rounded()).clamped(to: 0...100)
        let subtitle = minutes > 0
            ? String(format: "%.0f min", minutes)
            : "No session logged"
        let nominalWeight = KoruWeights.nominal[kind] ?? 0
        return ScoreComponent(
            kind: kind,
            rawValue: minutes > 0 ? minutes : 0,
            value: value,
            zScore: (minutes - 10) / 10,
            effectiveWeight: nominalWeight,
            subtitle: subtitle
        )
    }
}
