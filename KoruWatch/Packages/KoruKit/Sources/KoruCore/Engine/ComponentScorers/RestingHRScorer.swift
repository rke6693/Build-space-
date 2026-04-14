//
//  RestingHRScorer.swift
//  KoruCore
//

import Foundation

public enum RestingHRScorer: ComponentScoring {
    public static let kind: ComponentKind = .restingHeartRate

    public static func score(
        snapshot: HealthSnapshot,
        baselines: BaselineBook
    ) -> ScoreComponent {
        guard let value = snapshot.restingHeartRate else {
            return .unavailable(kind: kind)
        }
        let blended = BaselineBlender.blend(
            kind: kind,
            personal: baselines[kind],
            age: snapshot.ageYears ?? 35,
            sex: snapshot.biologicalSex ?? .unknown
        )
        let delta = value - blended.mean
        let subtitle = String(format: "%.0f bpm · %+.0f vs baseline", value, delta)
        return ComponentBuilder.build(
            kind: kind,
            rawValue: value,
            blended: blended,
            polarity: .negative,
            subtitle: subtitle
        )
    }
}
