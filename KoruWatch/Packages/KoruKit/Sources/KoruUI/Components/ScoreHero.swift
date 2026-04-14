//
//  ScoreHero.swift
//  KoruUI
//
//  Compound "hero" view that combines the ring, the numeral, and the
//  trend row in a single reusable component. Size is driven entirely
//  by the KoruDeviceClass in the environment, so the same view
//  compiles for Ultra 2, Series 9 45mm, and Series 9 41mm.
//

import SwiftUI
import KoruCore

public struct ScoreHero: View {
    public let score: WellnessScore
    @Environment(\.koruDevice) private var device

    public init(score: WellnessScore) {
        self.score = score
    }

    public var body: some View {
        VStack(spacing: 12) {
            ZStack {
                ScoreRing(
                    fraction: Double(score.value) / 100,
                    band: score.band,
                    strokeWidth: device.ringStroke,
                    diameter: device.ringDiameter
                )
                ScoreNumeral(value: score.value, fontSize: device.scoreFontSize)
                    .accessibilityLabel(Text("Wellness score \(score.value) out of 100, \(score.band.statusWord)"))
            }
            HStack(spacing: 4) {
                TrendArrow(delta: score.trend)
                Text(score.band.statusWord)
                    .font(KoruFont.statusWord)
                    .koruForeground(KoruColors.ink)
            }
        }
    }
}
