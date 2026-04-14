//
//  BaselineBlender.swift
//  KoruCore
//
//  Merges personal baseline stats with population norms using the
//  hybrid smoothstep alpha defined in Baseline.swift. On day 1 the
//  engine leans entirely on population norms; by day 14 it's fully
//  personal. No "locked" feeling.
//

import Foundation

public struct BlendedBaseline: Sendable, Hashable {
    public let mean: Double
    public let stdDev: Double
    public let alpha: Double  // 0…1, how personal the baseline is
}

public enum BaselineBlender {

    /// Blend personal stats (may be n=0) with a population norm using
    /// smoothstep α from the current sample count. When personal stats
    /// are too thin to have a std dev, we fall back to the population
    /// std dev weighted by (1 - α).
    public static func blend(
        kind: ComponentKind,
        personal: BaselineStats,
        population: PopulationNorm
    ) -> BlendedBaseline {
        let book = BaselineBook(perComponent: [kind: personal])
        let alpha = book.blendAlpha(for: kind)
        let personalStdDev = personal.stdDev > 0 ? personal.stdDev : population.stdDev
        let mean = alpha * personal.mean + (1 - alpha) * population.mean
        let stdDev = alpha * personalStdDev + (1 - alpha) * population.stdDev
        return BlendedBaseline(mean: mean, stdDev: stdDev, alpha: alpha)
    }

    /// Convenience: fetch the right population norm for a component
    /// given the user's demographics, then blend.
    public static func blend(
        kind: ComponentKind,
        personal: BaselineStats,
        age: Int,
        sex: HealthSnapshot.BiologicalSex
    ) -> BlendedBaseline {
        let norm: PopulationNorm
        switch kind {
        case .hrv:               norm = PopulationNorms.hrvSDNN(age: age, sex: sex)
        case .restingHeartRate:  norm = PopulationNorms.restingHeartRate(age: age, sex: sex)
        case .vo2Max:            norm = PopulationNorms.vo2Max(age: age, sex: sex)
        case .spo2:              norm = PopulationNorms.spo2
        case .respiratoryRate:   norm = PopulationNorms.respiratoryRate
        case .sleep:             norm = PopulationNorms.sleepAsleep(age: age)
        default:
            // Activity, workouts, temp, mindfulness don't use population
            // norms — they're relative to the user's own behavior only.
            norm = PopulationNorm(mean: personal.mean, stdDev: max(personal.stdDev, 1))
        }
        return blend(kind: kind, personal: personal, population: norm)
    }
}
