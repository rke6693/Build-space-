//
//  ScoreBand.swift
//  KoruCore
//
//  The qualitative "band" the score falls into. Drives the aurora
//  gradient orientation and the one-word status under the numeral.
//

import Foundation

public enum ScoreBand: String, Codable, CaseIterable, Hashable, Sendable {
    case recover   // 0–49
    case steady    // 50–69
    case strong    // 70–84
    case peak      // 85–100

    public static func from(value: Int) -> ScoreBand {
        switch value {
        case ..<50:    return .recover
        case 50..<70:  return .steady
        case 70..<85:  return .strong
        default:       return .peak
        }
    }

    public var statusWord: String {
        switch self {
        case .recover: return "Recover"
        case .steady:  return "Steady"
        case .strong:  return "Strong"
        case .peak:    return "Peak"
        }
    }

    /// Angular offset for the aurora gradient (in degrees), so low
    /// scores lean coral-dominant and high scores lean teal-dominant.
    /// Used by `AuroraGradient` in KoruUI.
    public var gradientStartDegrees: Double {
        switch self {
        case .recover: return 200  // coral dominant
        case .steady:  return 140  // violet dominant
        case .strong:  return 80   // teal-violet blend
        case .peak:    return 20   // teal dominant
        }
    }
}
