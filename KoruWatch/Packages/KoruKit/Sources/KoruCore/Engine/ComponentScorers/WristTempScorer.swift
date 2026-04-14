//
//  WristTempScorer.swift
//  KoruCore
//
//  HealthKit already provides this as a deviation from the user's own
//  baseline (`HKQuantityTypeIdentifierAppleSleepingWristTemperature`),
//  so we treat deviation magnitude directly and penalize either
//  direction — Koru surfaces anything abnormal.
//

import Foundation

public enum WristTempScorer: ComponentScoring {
    public static let kind: ComponentKind = .wristTemperature

    public static func score(
        snapshot: HealthSnapshot,
        baselines _: BaselineBook
    ) -> ScoreComponent {
        guard let delta = snapshot.wristTemperatureDeltaC else {
            return .unavailable(kind: kind)
        }
        // A ±0.3°C deviation is the "noticeable" threshold.
        // Map |delta| 0 → 100, 0.3 → 70, 0.6 → 35, 1.0 → 5.
        let absD = abs(delta)
        let raw: Double
        switch absD {
        case ..<0.1:   raw = 100
        case 0.1..<0.3: raw = 100 - (absD - 0.1) * 150
        case 0.3..<0.6: raw = 70  - (absD - 0.3) * 116.67
        case 0.6..<1.0: raw = 35  - (absD - 0.6) * 75
        default:       raw = 5
        }
        let value = Int(raw.rounded()).clamped(to: 0...100)
        let fahrenheit = delta * 9 / 5
        let subtitle = String(format: "%+.2f °C (%+.2f °F)", delta, fahrenheit)

        let nominalWeight = KoruWeights.nominal[kind] ?? 0
        return ScoreComponent(
            kind: kind,
            rawValue: delta,
            value: value,
            zScore: ZScoreMath.clamp(delta / 0.3),
            effectiveWeight: nominalWeight,
            subtitle: subtitle
        )
    }
}
