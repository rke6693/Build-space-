//
//  RespiratoryScorer.swift
//  KoruCore
//
//  Bidirectional penalty — either tachypnea or unusual bradypnea
//  depresses the score. Baseline is the user's 14-day personal
//  rate blended with the population norm.
//

import Foundation

public enum RespiratoryScorer: ComponentScoring {
    public static let kind: ComponentKind = .respiratoryRate

    public static func score(
        snapshot: HealthSnapshot,
        baselines: BaselineBook
    ) -> ScoreComponent {
        guard let value = snapshot.respiratoryRate else {
            return .unavailable(kind: kind)
        }
        let blended = BaselineBlender.blend(
            kind: kind,
            personal: baselines[kind],
            population: PopulationNorms.respiratoryRate
        )
        let delta = value - blended.mean
        let subtitle = String(format: "%.1f bpm · %+.1f", value, delta)
        return ComponentBuilder.build(
            kind: kind,
            rawValue: value,
            blended: blended,
            polarity: .bidirectional,
            subtitle: subtitle
        )
    }
}
