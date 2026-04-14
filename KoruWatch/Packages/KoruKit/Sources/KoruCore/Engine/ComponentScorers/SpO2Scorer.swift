//
//  SpO2Scorer.swift
//  KoruCore
//
//  Asymmetric: ≥95% is healthy (score plateau), drops sharply below
//  so the score surfaces possible hypoxic events.
//

import Foundation

public enum SpO2Scorer: ComponentScoring {
    public static let kind: ComponentKind = .spo2

    public static func score(
        snapshot: HealthSnapshot,
        baselines _: BaselineBook
    ) -> ScoreComponent {
        guard let value = snapshot.spo2 else {
            return .unavailable(kind: kind)
        }
        // Piecewise: ≥0.97 → 100, 0.95 → 85, 0.93 → 60, 0.90 → 30, 0.87 → 5.
        let pct = value * 100
        let raw: Double
        switch pct {
        case 97...:  raw = 100
        case 95..<97: raw = 85 + (pct - 95) * 7.5
        case 93..<95: raw = 60 + (pct - 93) * 12.5
        case 90..<93: raw = 30 + (pct - 90) * 10
        case 87..<90: raw =  5 + (pct - 87) * 8.33
        default:      raw =  0
        }
        let value100 = Int(raw.rounded()).clamped(to: 0...100)
        let subtitle = String(format: "%.0f%% overnight", pct)
        let nominalWeight = KoruWeights.nominal[kind] ?? 0
        return ScoreComponent(
            kind: kind,
            rawValue: value,
            value: value100,
            zScore: (value - 0.97) / 0.012,
            effectiveWeight: nominalWeight,
            subtitle: subtitle
        )
    }
}
