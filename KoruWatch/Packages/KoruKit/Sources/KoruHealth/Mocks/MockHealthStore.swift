//
//  MockHealthStore.swift
//  KoruHealth
//
//  In-memory HealthStoreProtocol conformer. Used by SwiftUI Previews,
//  simulator runs where the user has no data yet, and unit tests.
//

import Foundation
import KoruCore

public final class MockHealthStore: HealthStoreProtocol, @unchecked Sendable {

    public var snapshotOverride: HealthSnapshot?
    public var authOverride: HealthAuthorizationStatus = .authorized
    public var stateCycle: Int = 0

    public init(snapshot: HealthSnapshot? = nil) {
        self.snapshotOverride = snapshot
    }

    public var isAvailable: Bool { true }

    public func requestAuthorization(group: HealthAuthorizationGroup) async throws {
        // no-op
    }

    public func authorizationStatus(group: HealthAuthorizationGroup) -> HealthAuthorizationStatus {
        authOverride
    }

    public func snapshot(for day: Date) async throws -> HealthSnapshot {
        if let s = snapshotOverride { return s }
        return Self.preset(cycle: stateCycle, day: day)
    }

    public func logCheckInMindfulSession(startedAt: Date, durationSeconds: TimeInterval) async throws {
        // no-op
    }

    public func enableBackgroundDelivery() async throws {
        // no-op
    }

    // MARK: - Canned fixtures

    /// Four rotating preset states matching the HTML prototype.
    public static func preset(cycle: Int, day: Date) -> HealthSnapshot {
        var s = HealthSnapshot(day: day)
        switch cycle % 4 {
        case 0:                             // Strong · 82
            s.hrvSDNN = 68
            s.restingHeartRate = 53
            s.sleepAsleepSeconds = 7 * 3600 + 48 * 60
            s.sleepDeepREMSeconds = 1.7 * 3600
            s.sleepEfficiency = 0.93
            s.moveFraction = 1.05
            s.exerciseFraction = 1.0
            s.standFraction = 0.92
            s.workoutLoadToday = 240
            s.workoutLoad7dAvg = 220
            s.vo2Max = 48
            s.spo2 = 0.97
            s.respiratoryRate = 13.8
            s.wristTemperatureDeltaC = 0.05
            s.mindfulMinutes = 10

        case 1:                             // Steady · 64
            s.hrvSDNN = 58
            s.restingHeartRate = 56
            s.sleepAsleepSeconds = 6.87 * 3600
            s.sleepDeepREMSeconds = 1.2 * 3600
            s.sleepEfficiency = 0.88
            s.moveFraction = 0.78
            s.exerciseFraction = 0.65
            s.standFraction = 0.83
            s.workoutLoadToday = 120
            s.workoutLoad7dAvg = 220
            s.vo2Max = 46
            s.spo2 = 0.96
            s.respiratoryRate = 14.5
            s.wristTemperatureDeltaC = 0.18
            s.mindfulMinutes = 3

        case 2:                             // Recover · 43
            s.hrvSDNN = 34
            s.restingHeartRate = 61
            s.sleepAsleepSeconds = 6 * 3600
            s.sleepDeepREMSeconds = 0.9 * 3600
            s.sleepEfficiency = 0.80
            s.moveFraction = 0.55
            s.exerciseFraction = 0.30
            s.standFraction = 0.67
            s.workoutLoadToday = 380
            s.workoutLoad7dAvg = 220
            s.vo2Max = 46
            s.spo2 = 0.955
            s.respiratoryRate = 16.8
            s.wristTemperatureDeltaC = 0.42
            s.mindfulMinutes = 0

        default:                            // Peak · 91
            s.hrvSDNN = 94
            s.restingHeartRate = 50
            s.sleepAsleepSeconds = 8.17 * 3600
            s.sleepDeepREMSeconds = 2.0 * 3600
            s.sleepEfficiency = 0.95
            s.moveFraction = 1.20
            s.exerciseFraction = 1.30
            s.standFraction = 1.0
            s.workoutLoadToday = 250
            s.workoutLoad7dAvg = 240
            s.vo2Max = 50
            s.spo2 = 0.98
            s.respiratoryRate = 13.0
            s.wristTemperatureDeltaC = -0.05
            s.mindfulMinutes = 15
        }
        s.ageYears = 34
        s.biologicalSex = .unknown
        return s
    }
}
