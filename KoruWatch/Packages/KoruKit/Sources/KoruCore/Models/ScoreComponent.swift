//
//  ScoreComponent.swift
//  KoruCore
//
//  One of the 10 contributors to the Koru wellness score.
//  Each carries its raw value, resolved sub-score (0–100), z-score vs
//  baseline, weight, and an availability flag. The engine redistributes
//  weights at compute time when components are missing.
//

import Foundation

public enum ComponentKind: String, Codable, CaseIterable, Hashable, Sendable {
    case hrv
    case restingHeartRate
    case sleep
    case activityRings
    case workoutLoad
    case vo2Max
    case spo2
    case respiratoryRate
    case wristTemperature
    case mindfulness

    /// Human-readable label for the watch UI and VoiceOver rotor.
    public var label: String {
        switch self {
        case .hrv:              return "HRV"
        case .restingHeartRate: return "Resting HR"
        case .sleep:            return "Sleep"
        case .activityRings:    return "Activity"
        case .workoutLoad:      return "Workouts"
        case .vo2Max:           return "VO₂ Max"
        case .spo2:             return "Blood O₂"
        case .respiratoryRate:  return "Breath Rate"
        case .wristTemperature: return "Wrist Temp"
        case .mindfulness:      return "Mindful"
        }
    }

    /// Shorthand used in widget rectangular layouts (≤4 chars).
    public var compactLabel: String {
        switch self {
        case .hrv:              return "HRV"
        case .restingHeartRate: return "RHR"
        case .sleep:            return "Slp"
        case .activityRings:    return "Act"
        case .workoutLoad:      return "WO"
        case .vo2Max:           return "VO₂"
        case .spo2:             return "SpO₂"
        case .respiratoryRate:  return "Resp"
        case .wristTemperature: return "Temp"
        case .mindfulness:      return "Mind"
        }
    }
}

/// Polarity tells the engine whether a higher z-score should increase
/// or decrease the component sub-score. `.bidirectional` penalises
/// deviation from baseline in either direction (used for wrist temp
/// and respiratory rate).
public enum Polarity: Int, Codable, Sendable {
    case positive       //  higher = better
    case negative       //  lower  = better
    case bidirectional  //  closer to baseline = better
}

public struct ScoreComponent: Codable, Hashable, Sendable {
    public let kind: ComponentKind
    /// Raw underlying metric value (in its own units). `nil` means not available.
    public let rawValue: Double?
    /// 0–100 component score. 50 when z-score is 0.
    public let value: Int
    /// z-score vs hybrid baseline, clamped to ±3.
    public let zScore: Double
    /// Effective weight used at compute time (may differ from nominal
    /// weight when some components are missing).
    public let effectiveWeight: Double
    /// Freeform description shown under the bar in the insights page.
    /// e.g. "68 ms · +6 ms vs 14-day"
    public let subtitle: String

    public var isAvailable: Bool { rawValue != nil }

    public init(
        kind: ComponentKind,
        rawValue: Double?,
        value: Int,
        zScore: Double,
        effectiveWeight: Double,
        subtitle: String
    ) {
        self.kind            = kind
        self.rawValue        = rawValue
        self.value           = value.clamped(to: 0...100)
        self.zScore          = zScore.clamped(to: -3.0...3.0)
        self.effectiveWeight = effectiveWeight
        self.subtitle        = subtitle
    }

    /// Placeholder used when a component is unavailable (user denied
    /// permission or no samples today).
    public static func unavailable(kind: ComponentKind) -> ScoreComponent {
        ScoreComponent(
            kind: kind,
            rawValue: nil,
            value: 50,
            zScore: 0,
            effectiveWeight: 0,
            subtitle: "No data"
        )
    }
}
