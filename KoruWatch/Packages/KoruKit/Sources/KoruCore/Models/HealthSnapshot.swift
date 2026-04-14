//
//  HealthSnapshot.swift
//  KoruCore
//
//  The DTO that the HealthKit layer (or a mock) hands to the scoring
//  engine. All values are optional — missing metrics cause the engine
//  to redistribute weights across available components.
//
//  This file deliberately has ZERO HealthKit imports so KoruCore can
//  compile on macOS / Linux and tests can run without entitlements.
//

import Foundation

public struct HealthSnapshot: Codable, Hashable, Sendable {
    /// The user's calendar day this snapshot covers.
    public let day: Date

    // --- Vitals (overnight windows) -----------------------------------
    /// Heart rate variability — SDNN in milliseconds, overnight median.
    public var hrvSDNN: Double?
    /// Resting heart rate — bpm.
    public var restingHeartRate: Double?
    /// Overnight SpO2 median percentage (e.g. 0.97).
    public var spo2: Double?
    /// Overnight respiratory rate — breaths per minute.
    public var respiratoryRate: Double?
    /// Wrist temperature deviation vs personal baseline — in °C.
    /// Provided directly by HealthKit's `.appleSleepingWristTemperature`.
    public var wristTemperatureDeltaC: Double?

    // --- Sleep --------------------------------------------------------
    /// Total asleep duration, in seconds.
    public var sleepAsleepSeconds: TimeInterval?
    /// Deep + REM sleep duration, in seconds.
    public var sleepDeepREMSeconds: TimeInterval?
    /// Sleep efficiency — asleep / in-bed, 0…1.
    public var sleepEfficiency: Double?

    // --- Activity -----------------------------------------------------
    /// 0…1 fraction of Move goal reached today.
    public var moveFraction: Double?
    /// 0…1 fraction of Exercise goal reached today.
    public var exerciseFraction: Double?
    /// 0…1 fraction of Stand goal reached today (stand hours / 12).
    public var standFraction: Double?

    // --- Workouts & fitness ------------------------------------------
    /// Training load for today (TRIMP-lite: duration × average intensity).
    public var workoutLoadToday: Double?
    /// Trailing 7-day average load for comparison (used by the scorer).
    public var workoutLoad7dAvg: Double?
    /// VO2max estimate — ml/kg/min.
    public var vo2Max: Double?

    // --- Mindfulness --------------------------------------------------
    /// Mindful minutes logged today.
    public var mindfulMinutes: Double?

    // --- User context -------------------------------------------------
    /// Age in years (from HealthKit DOB) — used by population norms.
    public var ageYears: Int?
    /// Biological sex — used by population norms.
    public var biologicalSex: BiologicalSex?

    public enum BiologicalSex: String, Codable, Hashable, Sendable {
        case female, male, other, unknown
    }

    public init(day: Date) {
        self.day = day
    }
}
