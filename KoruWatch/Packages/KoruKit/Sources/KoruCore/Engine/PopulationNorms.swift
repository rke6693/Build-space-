//
//  PopulationNorms.swift
//  KoruCore
//
//  Static population norms keyed by age decade and biological sex.
//  Used during the 14-day baseline learning period (hybrid blend).
//
//  Sources (cited for reviewer confidence — not a medical device):
//  • HRV SDNN: Shaffer & Ginsberg (2017), "An Overview of Heart Rate
//    Variability Metrics and Norms", Frontiers in Public Health.
//  • RHR: Palatini (2007) and Apple Heart & Movement Study aggregates.
//  • VO2max: ACSM Guidelines for Exercise Testing and Prescription, 11e.
//

import Foundation

public struct PopulationNorm: Hashable, Sendable {
    public let mean: Double
    public let stdDev: Double
}

public enum PopulationNorms {

    // MARK: - HRV (SDNN, milliseconds)
    public static func hrvSDNN(age: Int, sex: HealthSnapshot.BiologicalSex) -> PopulationNorm {
        // Mean SDNN declines ~3 ms per decade after 30.
        let base: Double
        switch age {
        case ..<30:  base = 55
        case 30..<40: base = 50
        case 40..<50: base = 44
        case 50..<60: base = 38
        case 60..<70: base = 32
        default:      base = 28
        }
        let mean = sex == .female ? base - 2 : base
        return PopulationNorm(mean: mean, stdDev: 14)
    }

    // MARK: - Resting heart rate (bpm)
    public static func restingHeartRate(age: Int, sex: HealthSnapshot.BiologicalSex) -> PopulationNorm {
        let mean: Double = sex == .female ? 63 : 60
        return PopulationNorm(mean: mean, stdDev: 8)
    }

    // MARK: - VO2max (ml/kg/min)
    public static func vo2Max(age: Int, sex: HealthSnapshot.BiologicalSex) -> PopulationNorm {
        let male: Double
        switch age {
        case ..<30:  male = 45
        case 30..<40: male = 42
        case 40..<50: male = 38
        case 50..<60: male = 34
        case 60..<70: male = 30
        default:      male = 26
        }
        let mean = sex == .female ? male - 6 : male
        return PopulationNorm(mean: mean, stdDev: 6)
    }

    // MARK: - SpO2 (fraction)
    public static let spo2 = PopulationNorm(mean: 0.97, stdDev: 0.012)

    // MARK: - Respiratory rate (bpm)
    public static let respiratoryRate = PopulationNorm(mean: 14, stdDev: 2.2)

    // MARK: - Sleep duration (seconds)
    public static func sleepAsleep(age: Int) -> PopulationNorm {
        let mean: Double = age < 25 ? 8 * 3600 : 7.5 * 3600
        return PopulationNorm(mean: mean, stdDev: 45 * 60)  // 45-min std
    }
}
