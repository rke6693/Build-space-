//
//  HealthStore.swift
//  KoruHealth
//
//  Concrete HealthKit implementation of HealthStoreProtocol. Compiles
//  only where HealthKit is available (watchOS, iOS). A no-op stub is
//  provided on other platforms so KoruCore tests can still link.
//

import Foundation
import KoruCore

#if canImport(HealthKit)
import HealthKit

public final class HealthStore: HealthStoreProtocol, @unchecked Sendable {

    private let store: HKHealthStore

    public init() {
        self.store = HKHealthStore()
    }

    public var isAvailable: Bool {
        HKHealthStore.isHealthDataAvailable()
    }

    // MARK: - Authorization

    public func requestAuthorization(group: HealthAuthorizationGroup) async throws {
        guard isAvailable else { throw HealthError.notAvailable }
        let read = Self.readTypes(for: group)
        let write = Self.writeTypes(for: group)
        try await store.requestAuthorization(toShare: write, read: read)
    }

    public func authorizationStatus(group: HealthAuthorizationGroup) -> HealthAuthorizationStatus {
        guard isAvailable else { return .denied }
        let types = Self.readTypes(for: group)
        let statuses = types.map { store.authorizationStatus(for: $0) }
        let allSharingAuthorized = statuses.allSatisfy { $0 == .sharingAuthorized }
        let anySharingAuthorized = statuses.contains { $0 == .sharingAuthorized }
        if allSharingAuthorized { return .authorized }
        if anySharingAuthorized { return .partial }
        return statuses.contains(.sharingDenied) ? .denied : .notDetermined
    }

    // MARK: - Snapshot

    public func snapshot(for day: Date) async throws -> HealthSnapshot {
        guard isAvailable else { throw HealthError.notAvailable }

        let (dayStart, dayEnd) = Self.dayBounds(day)

        async let hrv        = HRVQuery.overnightMedian(store: store, dayStart: dayStart, dayEnd: dayEnd)
        async let rhr        = RestingHRQuery.dayValue(store: store, dayStart: dayStart, dayEnd: dayEnd)
        async let sleep      = SleepQuery.nightValues(store: store, dayStart: dayStart, dayEnd: dayEnd)
        async let activity   = ActivityRingsQuery.dayValues(store: store, day: day)
        async let workout    = WorkoutLoadQuery.dayValues(store: store, day: day)
        async let vo2        = VO2MaxQuery.latest(store: store, before: dayEnd)
        async let spo2       = SpO2Query.overnightMedian(store: store, dayStart: dayStart, dayEnd: dayEnd)
        async let resp       = RespiratoryQuery.overnightMedian(store: store, dayStart: dayStart, dayEnd: dayEnd)
        async let temp       = WristTempQuery.overnightDelta(store: store, dayStart: dayStart, dayEnd: dayEnd)
        async let mindful    = MindfulnessQuery.dayMinutes(store: store, day: day)
        async let ageSex     = UserContextQuery.ageSex(store: store)

        var snap = HealthSnapshot(day: day)
        snap.hrvSDNN                   = try? await hrv
        snap.restingHeartRate          = try? await rhr
        let sleepTuple                 = try? await sleep
        snap.sleepAsleepSeconds        = sleepTuple?.asleep
        snap.sleepDeepREMSeconds       = sleepTuple?.deepREM
        snap.sleepEfficiency           = sleepTuple?.efficiency
        let ringTuple                  = try? await activity
        snap.moveFraction              = ringTuple?.move
        snap.exerciseFraction          = ringTuple?.exercise
        snap.standFraction             = ringTuple?.stand
        let workoutTuple               = try? await workout
        snap.workoutLoadToday          = workoutTuple?.today
        snap.workoutLoad7dAvg          = workoutTuple?.sevenDayAverage
        snap.vo2Max                    = try? await vo2
        snap.spo2                      = try? await spo2
        snap.respiratoryRate           = try? await resp
        snap.wristTemperatureDeltaC    = try? await temp
        snap.mindfulMinutes            = try? await mindful
        let ctx                        = try? await ageSex
        snap.ageYears                  = ctx?.age
        snap.biologicalSex             = ctx?.sex
        return snap
    }

    // MARK: - Mindful session write

    public func logCheckInMindfulSession(startedAt: Date, durationSeconds: TimeInterval) async throws {
        guard let type = HKCategoryType.quantityType(forIdentifier: .mindfulSession) as? HKCategoryType
                      ?? HKObjectType.categoryType(forIdentifier: .mindfulSession) else {
            throw HealthError.queryFailed("mindfulSession type unavailable")
        }
        let end = startedAt.addingTimeInterval(durationSeconds)
        let sample = HKCategorySample(
            type: type,
            value: HKCategoryValue.notApplicable.rawValue,
            start: startedAt,
            end: end
        )
        try await store.save(sample)
    }

    // MARK: - Background delivery

    public func enableBackgroundDelivery() async throws {
        let candidates: [HKObjectType] = [
            HKObjectType.quantityType(forIdentifier: .heartRateVariabilitySDNN),
            HKObjectType.quantityType(forIdentifier: .restingHeartRate),
            HKObjectType.categoryType(forIdentifier: .sleepAnalysis),
        ].compactMap { $0 }

        for type in candidates {
            try await store.enableBackgroundDelivery(for: type, frequency: .hourly)
        }
    }

    // MARK: - Helpers

    private static func dayBounds(_ day: Date) -> (Date, Date) {
        let cal = Calendar.current
        let start = cal.startOfDay(for: day)
        let end = cal.date(byAdding: .day, value: 1, to: start) ?? day
        return (start, end)
    }

    private static func readTypes(for group: HealthAuthorizationGroup) -> Set<HKObjectType> {
        var types = Set<HKObjectType>()
        switch group {
        case .vitals:
            [.heartRateVariabilitySDNN, .restingHeartRate, .oxygenSaturation,
             .respiratoryRate, .appleSleepingWristTemperature]
                .compactMap(HKObjectType.quantityType(forIdentifier:))
                .forEach { types.insert($0) }
        case .activity:
            [.vo2Max, .activeEnergyBurned, .appleExerciseTime, .appleStandTime]
                .compactMap(HKObjectType.quantityType(forIdentifier:))
                .forEach { types.insert($0) }
            types.insert(HKObjectType.workoutType())
            if let summary = HKObjectType.activitySummaryType() as HKObjectType? {
                types.insert(summary)
            }
        case .sleep:
            if let sleep = HKObjectType.categoryType(forIdentifier: .sleepAnalysis) {
                types.insert(sleep)
            }
            if let mindful = HKObjectType.categoryType(forIdentifier: .mindfulSession) {
                types.insert(mindful)
            }
        }
        // Demographic types used by PopulationNorms.
        if let dob = HKObjectType.characteristicType(forIdentifier: .dateOfBirth) {
            types.insert(dob)
        }
        if let sex = HKObjectType.characteristicType(forIdentifier: .biologicalSex) {
            types.insert(sex)
        }
        return types
    }

    private static func writeTypes(for group: HealthAuthorizationGroup) -> Set<HKSampleType> {
        switch group {
        case .sleep:
            if let mindful = HKObjectType.categoryType(forIdentifier: .mindfulSession) {
                return [mindful]
            }
            return []
        default:
            return []
        }
    }
}

#else

/// Non-HealthKit platforms get a stub that always reports unavailable.
/// This keeps KoruCoreTests linkable on Linux / macOS CI.
public final class HealthStore: HealthStoreProtocol, @unchecked Sendable {
    public init() {}
    public var isAvailable: Bool { false }
    public func requestAuthorization(group: HealthAuthorizationGroup) async throws {
        throw HealthError.notAvailable
    }
    public func authorizationStatus(group: HealthAuthorizationGroup) -> HealthAuthorizationStatus {
        .notDetermined
    }
    public func snapshot(for day: Date) async throws -> HealthSnapshot {
        throw HealthError.notAvailable
    }
    public func logCheckInMindfulSession(startedAt: Date, durationSeconds: TimeInterval) async throws {
        throw HealthError.notAvailable
    }
    public func enableBackgroundDelivery() async throws {
        throw HealthError.notAvailable
    }
}

#endif
