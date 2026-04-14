//
//  ZScore.swift
//  KoruCore
//
//  Z-score → 0–100 sub-score using a sigmoid.
//  This keeps the component score bounded, smooth, and symmetric
//  around the baseline mean (z=0 → 50).
//

import Foundation

public enum ZScoreMath {
    /// Clamp a z-score to ±3 so a single noisy sample can't dominate.
    public static func clamp(_ z: Double) -> Double {
        z.clamped(to: -3.0...3.0)
    }

    /// Map a clamped z-score to 0–100 via sigmoid.
    ///
    ///   s = 100 / (1 + exp(-1.1 * z * sign))
    ///
    /// Polarity controls direction; `.bidirectional` passes |z| so any
    /// deviation from baseline depresses the score.
    public static func sigmoidScore(z: Double, polarity: Polarity) -> Int {
        let clamped = clamp(z)
        let signed: Double
        switch polarity {
        case .positive:      signed =  clamped
        case .negative:      signed = -clamped
        case .bidirectional: signed = -abs(clamped)
        }
        let raw = 100.0 / (1.0 + exp(-1.1 * signed))
        return Int(raw.rounded()).clamped(to: 0...100)
    }

    /// Compute a z-score from raw value + baseline mean & stddev.
    /// Falls back to 0 (i.e. exactly-at-baseline) when stddev is zero
    /// or the sample count is still too low for meaningful variance.
    public static func zScore(value: Double, mean: Double, stdDev: Double) -> Double {
        guard stdDev > 0.0001 else { return 0 }
        return (value - mean) / stdDev
    }
}

// MARK: - Clamped helper used throughout KoruCore

extension Comparable {
    @inlinable
    public func clamped(to range: ClosedRange<Self>) -> Self {
        min(max(self, range.lowerBound), range.upperBound)
    }
}
