//
//  SampleSnapshots.swift
//  KoruCoreTests
//
//  Test fixtures — deterministic HealthSnapshots covering cold-start,
//  partial-data, strong, and recovery scenarios.
//

import Foundation
@testable import KoruCore

enum Fixtures {

    static let dayStart: Date = {
        var c = DateComponents(year: 2026, month: 4, day: 14, hour: 0, minute: 0, second: 0)
        c.timeZone = TimeZone(identifier: "UTC")
        return Calendar(identifier: .gregorian).date(from: c)!
    }()

    /// A "peak" day — every metric in the healthy zone.
    static func peak(day: Date = dayStart) -> HealthSnapshot {
        var s = HealthSnapshot(day: day)
        s.hrvSDNN = 82
        s.restingHeartRate = 52
        s.sleepAsleepSeconds = 8 * 3600
        s.sleepDeepREMSeconds = 2 * 3600
        s.sleepEfficiency = 0.95
        s.moveFraction = 1.05
        s.exerciseFraction = 1.0
        s.standFraction = 1.0
        s.workoutLoadToday = 200
        s.workoutLoad7dAvg = 200
        s.vo2Max = 50
        s.spo2 = 0.98
        s.respiratoryRate = 13
        s.wristTemperatureDeltaC = 0.02
        s.mindfulMinutes = 12
        s.ageYears = 34
        s.biologicalSex = .unknown
        return s
    }

    /// A "recover" day — everything pointing to fatigue.
    static func recover(day: Date = dayStart) -> HealthSnapshot {
        var s = HealthSnapshot(day: day)
        s.hrvSDNN = 28
        s.restingHeartRate = 66
        s.sleepAsleepSeconds = 5.5 * 3600
        s.sleepDeepREMSeconds = 0.6 * 3600
        s.sleepEfficiency = 0.78
        s.moveFraction = 0.55
        s.exerciseFraction = 0.25
        s.standFraction = 0.60
        s.workoutLoadToday = 350
        s.workoutLoad7dAvg = 150
        s.vo2Max = 40
        s.spo2 = 0.94
        s.respiratoryRate = 17
        s.wristTemperatureDeltaC = 0.55
        s.mindfulMinutes = 0
        s.ageYears = 34
        s.biologicalSex = .unknown
        return s
    }

    /// Partial data — the user only wears at night so activity
    /// components are missing.
    static func partial(day: Date = dayStart) -> HealthSnapshot {
        var s = HealthSnapshot(day: day)
        s.hrvSDNN = 60
        s.restingHeartRate = 56
        s.sleepAsleepSeconds = 7 * 3600
        s.sleepDeepREMSeconds = 1.4 * 3600
        s.sleepEfficiency = 0.9
        // moveFraction, exerciseFraction, standFraction, workoutLoadToday all nil
        s.vo2Max = 46
        s.spo2 = 0.97
        s.respiratoryRate = 14
        s.wristTemperatureDeltaC = 0.1
        s.mindfulMinutes = 5
        s.ageYears = 34
        s.biologicalSex = .unknown
        return s
    }
}
