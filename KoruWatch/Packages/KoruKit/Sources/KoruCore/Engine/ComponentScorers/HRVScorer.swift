//
//  HRVScorer.swift
//  KoruCore
//

import Foundation

public enum HRVScorer: ComponentScoring {
    public static let kind: ComponentKind = .hrv

    public static func score(
        snapshot: HealthSnapshot,
        baselines: BaselineBook
    ) -> ScoreComponent {
        guard let value = snapshot.hrvSDNN else {
            return .unavailable(kind: kind)
        }
        let blended = BaselineBlender.blend(
            kind: kind,
            personal: baselines[kind],
            age: snapshot.ageYears ?? 35,
            sex: snapshot.biologicalSex ?? .unknown
        )
        let delta = value - blended.mean
        let subtitle = String(format: "%.0f ms · %+.0f vs baseline", value, delta)
        return ComponentBuilder.build(
            kind: kind,
            rawValue: value,
            blended: blended,
            polarity: .positive,
            subtitle: subtitle
        )
    }
}
