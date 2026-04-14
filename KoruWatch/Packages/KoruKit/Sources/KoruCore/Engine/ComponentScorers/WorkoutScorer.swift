//
//  WorkoutScorer.swift
//  KoruCore
//
//  Training-load (TRIMP-lite) scorer with an inverted-U curve so
//  both undertraining and overtraining depress the component.
//

import Foundation

public enum WorkoutScorer: ComponentScoring {
    public static let kind: ComponentKind = .workoutLoad

    public static func score(
        snapshot: HealthSnapshot,
        baselines _: BaselineBook
    ) -> ScoreComponent {
        // Require at least today's load. Seven-day average may be nil
        // (new user) — fall back to `today` so we don't penalize.
        guard let today = snapshot.workoutLoadToday else {
            return .unavailable(kind: kind)
        }
        let avg = snapshot.workoutLoad7dAvg ?? today
        let ratio = avg > 0.001 ? today / avg : 1.0

        // Inverted-U: peak at ratio = 1.0, falls off either side.
        //   score = 100 * exp(-2.2 * (ratio - 1)^2)
        // ratio 0.5 → ~58, ratio 1.0 → 100, ratio 1.5 → ~58, ratio 2.0 → ~11
        let raw = 100 * exp(-2.2 * pow(ratio - 1, 2))
        let value = Int(raw.rounded()).clamped(to: 0...100)
        let subtitle = String(format: "%.2f× 7-day avg", ratio)

        let nominalWeight = KoruWeights.nominal[kind] ?? 0
        return ScoreComponent(
            kind: kind,
            rawValue: today,
            value: value,
            zScore: ratio - 1,
            effectiveWeight: nominalWeight,
            subtitle: subtitle
        )
    }
}
