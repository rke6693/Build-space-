//
//  KoruDeviceClass.swift
//  KoruUI
//
//  Maps the physical Apple Watch in use to a size class that drives
//  layout (numeral size, ring diameter, padding). Inspecting
//  WKInterfaceDevice.screenBounds at launch gives us the exact case.
//

import SwiftUI
#if canImport(WatchKit)
import WatchKit
#endif

public enum KoruDeviceClass: String, Sendable, Hashable {
    case ultra2     // 49mm — 410 × 502
    case series9_45 // 45mm — 396 × 484
    case series9_41 // 41mm — 352 × 430

    public var label: String {
        switch self {
        case .ultra2:     return "Ultra 2 · 49mm"
        case .series9_45: return "Series 9 · 45mm"
        case .series9_41: return "Series 9 · 41mm"
        }
    }

    public var screenWidth:  CGFloat {
        switch self {
        case .ultra2:     return 410
        case .series9_45: return 396
        case .series9_41: return 352
        }
    }

    public var screenHeight: CGFloat {
        switch self {
        case .ultra2:     return 502
        case .series9_45: return 484
        case .series9_41: return 430
        }
    }

    // MARK: - Layout tokens

    public var scoreFontSize: CGFloat {
        switch self {
        case .ultra2:     return 96
        case .series9_45: return 88
        case .series9_41: return 80
        }
    }

    public var ringDiameter: CGFloat {
        switch self {
        case .ultra2:     return 240
        case .series9_45: return 218
        case .series9_41: return 190
        }
    }

    public var ringStroke: CGFloat {
        switch self {
        case .ultra2:     return 14
        case .series9_45: return 13
        case .series9_41: return 11
        }
    }

    public var horizontalPadding: CGFloat {
        switch self {
        case .ultra2:     return 20
        case .series9_45: return 18
        case .series9_41: return 14
        }
    }

    public var hasActionButton: Bool { self == .ultra2 }

    // MARK: - Detection

    /// Detect the current device by inspecting the physical screen size.
    /// Falls back to .ultra2 for Previews and non-watchOS runtimes.
    public static func current() -> KoruDeviceClass {
        #if canImport(WatchKit) && os(watchOS)
        let bounds = WKInterfaceDevice.current().screenBounds
        let w = bounds.width
        // Use a stable threshold: Ultra is widest, 41mm is narrowest.
        if w >= 205 { return .ultra2 }       // Ultra 2 logical points
        if w >= 195 { return .series9_45 }
        return .series9_41
        #else
        return .ultra2
        #endif
    }
}

// Convenience environment key so views can read this anywhere.

private struct KoruDeviceClassKey: EnvironmentKey {
    static let defaultValue: KoruDeviceClass = .ultra2
}

public extension EnvironmentValues {
    var koruDevice: KoruDeviceClass {
        get { self[KoruDeviceClassKey.self] }
        set { self[KoruDeviceClassKey.self] = newValue }
    }
}
