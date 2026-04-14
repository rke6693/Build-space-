//
//  VO2MaxScorer.swift
//  KoruCore
//

import Foundation

public enum VO2MaxScorer: ComponentScoring {
    public static let kind: ComponentKind = .vo2Max

    public static func score(
        snapshot: HealthSnapshot,
        baselines: BaselineBook
    ) -> ScoreComponent {
        guard let value = snapshot.vo2Max else {
            return .unavailable(kind: kind)
        }
        let blended = BaselineBlender.blend(
            kind: kind,
            personal: baselines[kind],
            age: snapshot.ageYears ?? 35,
            sex: snapshot.biologicalSex ?? .unknown
        )
        let subtitle = String(format: "%.1f ml/kg/min", value)
        return ComponentBuilder.build(
            kind: kind,
            rawValue: value,
            blended: blended,
            polarity: .positive,
            subtitle: subtitle
        )
    }
}
