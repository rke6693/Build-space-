//
//  KoruTypography.swift
//  KoruUI
//
//  Typography tokens for Koru. The score numeral uses SF Pro Rounded
//  Semibold — big, friendly, and glyph-distinctive on a tiny display.
//  All other text uses SF Pro Text for legibility at small sizes.
//

import SwiftUI

public enum KoruFont {

    // Score numeral — size depends on device class (set in ScoreNumeral.swift).
    public static func scoreNumeral(size: CGFloat) -> Font {
        .system(size: size, weight: .semibold, design: .rounded)
    }

    public static var statusWord: Font {
        .system(size: 17, weight: .semibold, design: .rounded)
    }

    public static var sectionHeader: Font {
        .system(size: 12, weight: .semibold, design: .rounded)
            .smallCaps()
    }

    public static var body: Font { .system(size: 14, weight: .regular, design: .default) }
    public static var bodyEmphasis: Font { .system(size: 14, weight: .semibold, design: .default) }
    public static var caption: Font { .system(size: 12, weight: .regular, design: .default) }
}
