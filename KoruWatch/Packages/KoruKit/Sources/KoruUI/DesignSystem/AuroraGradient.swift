//
//  AuroraGradient.swift
//  KoruUI
//
//  The signature Koru aurora gradient. Used on the ring, the large
//  buttons, and brand accents. The gradient angle subtly shifts with
//  the current score band so low scores feel warm (coral-dominant)
//  and high scores feel cool (teal-dominant).
//

import SwiftUI
import KoruCore

public struct AuroraGradient {

    /// Build an angular gradient appropriate for the given band.
    /// Used by ScoreRing so the sweep follows the ring's natural orbit.
    public static func angular(for band: ScoreBand, theme: KoruTheme, colorScheme: ColorScheme) -> AngularGradient {
        let teal   = KoruColors.auroraTeal.resolve(theme, colorScheme: colorScheme)
        let violet = KoruColors.auroraViolet.resolve(theme, colorScheme: colorScheme)
        let coral  = KoruColors.auroraCoral.resolve(theme, colorScheme: colorScheme)
        let stops: [Gradient.Stop] = [
            .init(color: teal,   location: 0.00),
            .init(color: violet, location: 0.50),
            .init(color: coral,  location: 1.00),
        ]
        return AngularGradient(
            gradient: Gradient(stops: stops),
            center: .center,
            startAngle: .degrees(band.gradientStartDegrees - 90),
            endAngle: .degrees(band.gradientStartDegrees + 270)
        )
    }

    /// Linear diagonal variant used on buttons and compact widgets.
    public static func linear(theme: KoruTheme, colorScheme: ColorScheme) -> LinearGradient {
        let teal   = KoruColors.auroraTeal.resolve(theme, colorScheme: colorScheme)
        let violet = KoruColors.auroraViolet.resolve(theme, colorScheme: colorScheme)
        let coral  = KoruColors.auroraCoral.resolve(theme, colorScheme: colorScheme)
        return LinearGradient(
            colors: [teal, violet, coral],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        )
    }
}

// Provide ScoreBand → ScoreBandLike so KoruColors.bandAccent works.
extension ScoreBand: ScoreBandLike {
    public var key: String { rawValue }
}
