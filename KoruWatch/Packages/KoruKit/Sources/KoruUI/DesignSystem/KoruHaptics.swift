//
//  KoruHaptics.swift
//  KoruUI
//
//  Haptic vocabulary, centralized so we can audit every buzz.
//  All paths conditionally compile — haptics ship only on watchOS.
//

import Foundation

#if canImport(WatchKit)
import WatchKit
#endif

public enum KoruHaptic: String, Sendable, CaseIterable {
    case scoreRevealed
    case checkInTap
    case checkInSaved
    case recoveryAlert
    case nightModeOn
    case nightModeOff
    case pageTurn
    case success
    case warning

    public func play() {
        #if canImport(WatchKit) && os(watchOS)
        let type: WKHapticType
        switch self {
        case .scoreRevealed:  type = .success
        case .checkInTap:     type = .click
        case .checkInSaved:   type = .notification
        case .recoveryAlert:  type = .notification
        case .nightModeOn:    type = .directionDown
        case .nightModeOff:   type = .directionUp
        case .pageTurn:       type = .click
        case .success:        type = .success
        case .warning:        type = .failure
        }
        WKInterfaceDevice.current().play(type)
        #endif
    }
}
