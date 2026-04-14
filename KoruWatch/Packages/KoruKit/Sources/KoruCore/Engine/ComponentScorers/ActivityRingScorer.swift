//
//  ActivityRingScorer.swift
//  KoruCore
//
//  Blends the three Apple activity rings into a single 0–100 score.
//  Closing all rings = 100. Partial closures weighted:
//      Move 50% · Exercise 30% · Stand 20%
//

import Foundation

public enum ActivityRingScorer: ComponentScoring {
    public static let kind: ComponentKind = .activityRings

    public static func score(
        snapshot: HealthSnapshot,
        baselines _: BaselineBook
    ) -> ScoreComponent {
        // Need at least Move to report anything meaningful.
        guard let move = snapshot.moveFraction else {
            return .unavailable(kind: kind)
        }
        let exercise = snapshot.exerciseFraction ?? 0
        let stand    = snapshot.standFraction    ?? 0

        let composite = 0.50 * min(move, 1.1) * 100
                      + 0.30 * min(exercise, 1.1) * 100
                      + 0.20 * min(stand, 1.1) * 100
        let value = Int(composite.rounded()).clamped(to: 0...100)

        let subtitle = String(
            format: "Move %d%% · Ex %d%% · Stand %d%%",
            Int(move * 100),
            Int(exercise * 100),
            Int(stand * 100)
        )

        // Activity is behavioral, not physiological — treat z-score as
        // 0 (at baseline) for surfacing purposes and let the composite
        // speak for itself.
        let nominalWeight = KoruWeights.nominal[kind] ?? 0
        return ScoreComponent(
            kind: kind,
            rawValue: move,
            value: value,
            zScore: 0,
            effectiveWeight: nominalWeight,
            subtitle: subtitle
        )
    }
}
