//
//  HealthStoreProtocol.swift
//  KoruHealth
//
//  Abstract interface over HealthKit. Lets ScoringEngine consume
//  health data without any Apple framework dependency — the real
//  HKHealthStore implementation and a MockHealthStore both conform.
//

import Foundation
import KoruCore

public enum HealthAuthorizationGroup: String, CaseIterable, Sendable {
    case vitals      // HRV, RHR, SpO2, Respiratory, Wrist temp
    case activity    // Rings, workouts, VO2max
    case sleep       // Sleep analysis, mindfulness
}

public enum HealthAuthorizationStatus: Sendable {
    case notDetermined
    case partial
    case authorized
    case denied
}

public protocol HealthStoreProtocol: Sendable {
    /// Whether the underlying platform actually supports HealthKit.
    /// False on simulator for some data types and on macOS targets.
    var isAvailable: Bool { get }

    /// Request authorization for one of the three onboarding groups.
    /// Each group requests a coherent set of types in one sheet.
    func requestAuthorization(group: HealthAuthorizationGroup) async throws

    /// Query the current authorization status for a group.
    func authorizationStatus(group: HealthAuthorizationGroup) -> HealthAuthorizationStatus

    /// Build a HealthSnapshot for the given calendar day.
    /// The implementation runs multiple anchored / statistics queries
    /// in parallel and merges results.
    func snapshot(for day: Date) async throws -> HealthSnapshot

    /// Log a completed mindfulness "check-in" sample (HK mindful minute).
    func logCheckInMindfulSession(startedAt: Date, durationSeconds: TimeInterval) async throws

    /// Register background delivery for the metrics that benefit most:
    /// HRV, resting HR, and sleep analysis. Called once from the watch
    /// app at launch; safe to call repeatedly.
    func enableBackgroundDelivery() async throws
}

public enum HealthError: Error, Sendable {
    case notAvailable
    case unauthorized
    case queryFailed(String)
}
