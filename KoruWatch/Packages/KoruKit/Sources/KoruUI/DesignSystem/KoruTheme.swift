//
//  KoruTheme.swift
//  KoruUI
//
//  The app-wide theme model. Exposed as an `@Observable` so any view
//  that reads `@Environment(\.koruTheme)` updates instantly when the
//  user toggles Night Mode or a scheduled transition fires.
//

import SwiftUI

public enum KoruTheme: String, Sendable, CaseIterable, Hashable {
    case auto     // follow system dark/light
    case day
    case dark
    case night    // red-on-black, dark-adaptation preserving
}

private struct KoruThemeKey: EnvironmentKey {
    static let defaultValue: KoruTheme = .auto
}

public extension EnvironmentValues {
    var koruTheme: KoruTheme {
        get { self[KoruThemeKey.self] }
        set { self[KoruThemeKey.self] = newValue }
    }
}

public extension View {
    func koruTheme(_ theme: KoruTheme) -> some View {
        environment(\.koruTheme, theme)
            .preferredColorScheme(theme == .night ? .dark : nil)
    }
}

// MARK: - Night Mode schedule helper

public struct NightModeSchedule: Codable, Hashable, Sendable {
    public var enabled: Bool
    /// Seconds since midnight in the user's local timezone.
    public var startSeconds: Int
    public var endSeconds: Int

    public init(enabled: Bool = true, startSeconds: Int = 22 * 3600, endSeconds: Int = 6 * 3600) {
        self.enabled = enabled
        self.startSeconds = startSeconds
        self.endSeconds = endSeconds
    }

    public func isActive(at date: Date, calendar: Calendar = .current) -> Bool {
        guard enabled else { return false }
        let comps = calendar.dateComponents([.hour, .minute, .second], from: date)
        let now = (comps.hour ?? 0) * 3600 + (comps.minute ?? 0) * 60 + (comps.second ?? 0)
        if startSeconds <= endSeconds {
            return now >= startSeconds && now < endSeconds
        } else {
            // Window wraps midnight (e.g. 22:00 → 06:00).
            return now >= startSeconds || now < endSeconds
        }
    }
}
