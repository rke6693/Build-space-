//
//  ComponentScoring.swift
//  KoruCore
//
//  Shared protocol for the 10 component scorers. Each scorer takes a
//  HealthSnapshot + BaselineBook and returns a ScoreComponent. Pure,
//  deterministic, unit-testable.
//

import Foundation

public protocol ComponentScoring {
    /// The component kind this scorer is responsible for.
    static var kind: ComponentKind { get }

    /// Compute the sub-score. Returns `.unavailable(kind:)` if the
    /// required raw data is missing from the snapshot.
    static func score(
        snapshot: HealthSnapshot,
        baselines: BaselineBook
    ) -> ScoreComponent
}

/// Convenience: produce a fully-formed ScoreComponent from a
/// blended baseline, a raw sample, and a polarity. Used by every
/// scorer so weight propagation stays consistent.
public enum ComponentBuilder {
    public static func build(
        kind: ComponentKind,
        rawValue: Double,
        blended: BlendedBaseline,
        polarity: Polarity,
        subtitle: String
    ) -> ScoreComponent {
        let z = ZScoreMath.zScore(
            value: rawValue,
            mean: blended.mean,
            stdDev: blended.stdDev
        )
        let value = ZScoreMath.sigmoidScore(z: z, polarity: polarity)
        let nominalWeight = KoruWeights.nominal[kind] ?? 0
        return ScoreComponent(
            kind: kind,
            rawValue: rawValue,
            value: value,
            zScore: ZScoreMath.clamp(z),
            effectiveWeight: nominalWeight,
            subtitle: subtitle
        )
    }
}
