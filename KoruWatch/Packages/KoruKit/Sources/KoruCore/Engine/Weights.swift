//
//  Weights.swift
//  KoruCore
//
//  The 10 nominal weights used by the scoring engine. Locked and
//  opinionated (per user decision); not exposed to Settings. Summing
//  to exactly 1.0 is verified at launch via a unit test.
//

import Foundation

public enum KoruWeights {
    public static let nominal: [ComponentKind: Double] = [
        .hrv:               0.18,
        .sleep:             0.18,
        .restingHeartRate:  0.12,
        .activityRings:     0.12,
        .workoutLoad:       0.08,
        .vo2Max:            0.08,
        .wristTemperature:  0.08,
        .spo2:              0.06,
        .respiratoryRate:   0.05,
        .mindfulness:       0.05,
    ]

    /// Runtime assertion used in tests: nominal weights sum to 1.
    public static var nominalSum: Double {
        nominal.values.reduce(0, +)
    }

    /// Polarity per component.
    public static let polarity: [ComponentKind: Polarity] = [
        .hrv:               .positive,
        .sleep:             .positive,
        .restingHeartRate:  .negative,
        .activityRings:     .positive,
        .workoutLoad:       .positive,          // overload penalty applied inside scorer
        .vo2Max:            .positive,
        .wristTemperature:  .bidirectional,
        .spo2:              .positive,
        .respiratoryRate:   .bidirectional,
        .mindfulness:       .positive,
    ]
}
