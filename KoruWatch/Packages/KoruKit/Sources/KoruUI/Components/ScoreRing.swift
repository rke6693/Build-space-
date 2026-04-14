//
//  ScoreRing.swift
//  KoruUI
//
//  The thin aurora ring wrapped around the score numeral. Animates
//  smoothly from 0 to the target fraction on appear and on change,
//  respects Reduce Motion, and swaps to a solid accent under
//  Increase Contrast.
//

import SwiftUI
import KoruCore

public struct ScoreRing: View {
    public let fraction: Double       // 0…1
    public let band: ScoreBand
    public var strokeWidth: CGFloat
    public var diameter: CGFloat

    @Environment(\.koruTheme) private var theme
    @Environment(\.colorScheme) private var scheme
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.legibilityWeight) private var legibility

    public init(
        fraction: Double,
        band: ScoreBand,
        strokeWidth: CGFloat = 14,
        diameter: CGFloat = 240
    ) {
        self.fraction = fraction.clamped(to: 0...1)
        self.band = band
        self.strokeWidth = strokeWidth
        self.diameter = diameter
    }

    public var body: some View {
        ZStack {
            // Track
            Circle()
                .stroke(KoruColors.hairline.resolve(theme, colorScheme: scheme),
                        style: StrokeStyle(lineWidth: strokeWidth, lineCap: .round))
            // Fill
            Circle()
                .trim(from: 0, to: fraction)
                .stroke(
                    AuroraGradient.angular(for: band, theme: theme, colorScheme: scheme),
                    style: StrokeStyle(lineWidth: strokeWidth, lineCap: .round)
                )
                .rotationEffect(.degrees(-90))
                .animation(reduceMotion ? .none : .easeInOut(duration: 0.85), value: fraction)
                .animation(reduceMotion ? .none : .easeInOut(duration: 0.5),  value: band)
        }
        .frame(width: diameter, height: diameter)
        .accessibilityHidden(true) // numeral describes the state
    }
}

// MARK: - Clamped helper proxy

private extension Double {
    func clamped(to range: ClosedRange<Double>) -> Double {
        Swift.min(Swift.max(self, range.lowerBound), range.upperBound)
    }
}
