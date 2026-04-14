//
//  SleepScorer.swift
//  KoruCore
//
//  Sleep is a sub-weighted blend:
//      60% duration vs age-appropriate need
//      25% deep + REM share of total sleep
//      15% efficiency (asleep / in-bed)
//

import Foundation

public enum SleepScorer: ComponentScoring {
    public static let kind: ComponentKind = .sleep

    public static func score(
        snapshot: HealthSnapshot,
        baselines: BaselineBook
    ) -> ScoreComponent {
        guard let asleep = snapshot.sleepAsleepSeconds else {
            return .unavailable(kind: kind)
        }

        let age = snapshot.ageYears ?? 35
        let durationNorm = PopulationNorms.sleepAsleep(age: age)
        let personal = baselines[kind]
        let blendedDuration = BaselineBlender.blend(
            kind: kind,
            personal: personal,
            population: durationNorm
        )

        // --- Duration sub-score ---------------------------------------
        let zDuration = ZScoreMath.zScore(
            value: asleep,
            mean: blendedDuration.mean,
            stdDev: blendedDuration.stdDev
        )
        let durationSub = Double(ZScoreMath.sigmoidScore(z: zDuration, polarity: .positive))

        // --- Deep + REM sub-score -------------------------------------
        // Healthy target ≈ 20–25% of total sleep. Score plateaus above 20%.
        let deepREMFrac: Double = {
            guard let deepREM = snapshot.sleepDeepREMSeconds, asleep > 0 else { return 0.20 }
            return (deepREM / asleep).clamped(to: 0...0.5)
        }()
        let deepREMSub = min(100, (deepREMFrac / 0.20) * 80 + 20)  // 0.20 → 100

        // --- Efficiency sub-score -------------------------------------
        let efficiency = snapshot.sleepEfficiency ?? 0.9
        let efficiencySub = (efficiency * 100).clamped(to: 0...100)

        let composite = 0.60 * durationSub
                      + 0.25 * deepREMSub
                      + 0.15 * efficiencySub

        let hours = asleep / 3600
        let deepPct = Int(deepREMFrac * 100)
        let subtitle = String(format: "%.1fh · %d%% deep+REM", hours, deepPct)

        let nominalWeight = KoruWeights.nominal[kind] ?? 0
        return ScoreComponent(
            kind: kind,
            rawValue: asleep,
            value: Int(composite.rounded()),
            zScore: ZScoreMath.clamp(zDuration),
            effectiveWeight: nominalWeight,
            subtitle: subtitle
        )
    }
}
