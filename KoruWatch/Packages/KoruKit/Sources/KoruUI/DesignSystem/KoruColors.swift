//
//  KoruColors.swift
//  KoruUI
//
//  The Koru color palette — day, dark, and night-mode-red variants.
//  Mirrored 1:1 against `prototype/styles.css` so the web prototype
//  and the shipping app look identical. All colors are defined in
//  sRGB space so Asset Catalog and code stay aligned.
//

import SwiftUI

public enum KoruColors {

    // MARK: - Neutrals

    public static let ink     = adaptive(light: .hex("0B0F14"), dark: .hex("F4F6F8"), night: .hex("FF2424"))
    public static let inkDim  = adaptive(light: .hex("5C6370"), dark: .hex("8C94A3"), night: .hex("A61313"))
    public static let surface = adaptive(light: .hex("FBFBFD"), dark: .hex("000000"), night: .hex("000000"))
    public static let surface2 = adaptive(light: .hex("F1F2F5"), dark: .hex("0B0F14"), night: .hex("0A0000"))
    public static let hairline = adaptive(
        light: Color.black.opacity(0.08),
        dark:  Color.white.opacity(0.08),
        night: Color(red: 1, green: 0.2, blue: 0.2).opacity(0.18)
    )

    // MARK: - Aurora stops
    //
    // These are the raw gradient stops. They're the same in day & dark
    // mode (the ring looks like aurora). In night mode they collapse
    // to red variants for dark adaptation.

    public static let auroraTeal   = adaptive(light: .hex("37E2D5"), dark: .hex("37E2D5"), night: .hex("FF1A1A"))
    public static let auroraViolet = adaptive(light: .hex("7B5CFF"), dark: .hex("7B5CFF"), night: .hex("CC0000"))
    public static let auroraCoral  = adaptive(light: .hex("FF6B6B"), dark: .hex("FF6B6B"), night: .hex("FF4444"))

    // MARK: - Band → accent mapping

    public static func bandAccent(_ band: ScoreBandLike) -> Color {
        switch band.key {
        case "recover": return auroraCoral
        case "steady":  return auroraViolet
        case "strong":  return auroraTeal
        case "peak":    return auroraTeal
        default:        return auroraViolet
        }
    }
}

/// Protocol erasure for ScoreBand so KoruUI doesn't need to import KoruCore
/// just for a color lookup (it already does for models — this is belt-and-braces).
public protocol ScoreBandLike {
    var key: String { get }
}

// MARK: - Environment-aware color resolver
//
// Koru has three logical modes:
//   .day   (standard light)
//   .dark  (standard dark, most watchOS users)
//   .night (dark-adaptation preserving red-on-black)
//
// The resolver reads the `koruTheme` environment key and returns the
// correct variant for any `AdaptiveColor`. Assigning a `KoruColors.ink`
// in a view automatically picks the right one.

public struct AdaptiveColor: Sendable {
    let light: Color
    let dark: Color
    let night: Color

    public func resolve(_ theme: KoruTheme, colorScheme: ColorScheme) -> Color {
        switch theme {
        case .night: return night
        case .auto:  return colorScheme == .dark ? dark : light
        case .day:   return light
        case .dark:  return dark
        }
    }
}

fileprivate func adaptive(light: Color, dark: Color, night: Color) -> AdaptiveColor {
    AdaptiveColor(light: light, dark: dark, night: night)
}

// Sugar so `.foregroundStyle(KoruColors.ink)` works where SwiftUI
// expects a ShapeStyle-producing value. We provide an environment
// modifier below that resolves the AdaptiveColor to a plain Color.

public struct KoruColorModifier: ViewModifier {
    let adaptive: AdaptiveColor
    @Environment(\.koruTheme) private var theme
    @Environment(\.colorScheme) private var scheme
    let apply: (Color) -> AnyView

    public func body(content: Content) -> some View {
        apply(adaptive.resolve(theme, colorScheme: scheme))
    }
}

public extension View {
    func koruForeground(_ c: AdaptiveColor) -> some View {
        modifier(_KoruForeground(adaptive: c))
    }
    func koruBackground(_ c: AdaptiveColor) -> some View {
        modifier(_KoruBackground(adaptive: c))
    }
    func koruTint(_ c: AdaptiveColor) -> some View {
        modifier(_KoruTint(adaptive: c))
    }
}

private struct _KoruForeground: ViewModifier {
    let adaptive: AdaptiveColor
    @Environment(\.koruTheme) private var theme
    @Environment(\.colorScheme) private var scheme
    func body(content: Content) -> some View {
        content.foregroundStyle(adaptive.resolve(theme, colorScheme: scheme))
    }
}
private struct _KoruBackground: ViewModifier {
    let adaptive: AdaptiveColor
    @Environment(\.koruTheme) private var theme
    @Environment(\.colorScheme) private var scheme
    func body(content: Content) -> some View {
        content.background(adaptive.resolve(theme, colorScheme: scheme))
    }
}
private struct _KoruTint: ViewModifier {
    let adaptive: AdaptiveColor
    @Environment(\.koruTheme) private var theme
    @Environment(\.colorScheme) private var scheme
    func body(content: Content) -> some View {
        content.tint(adaptive.resolve(theme, colorScheme: scheme))
    }
}

// MARK: - Hex Color helper

extension Color {
    static func hex(_ hex: String) -> Color {
        var s = hex
        if s.hasPrefix("#") { s.removeFirst() }
        var v: UInt64 = 0
        Scanner(string: s).scanHexInt64(&v)
        let r = Double((v >> 16) & 0xFF) / 255
        let g = Double((v >> 8)  & 0xFF) / 255
        let b = Double( v        & 0xFF) / 255
        return Color(red: r, green: g, blue: b)
    }
}
