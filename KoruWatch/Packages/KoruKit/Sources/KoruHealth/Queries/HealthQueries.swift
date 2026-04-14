//
//  HealthQueries.swift
//  KoruHealth
//
//  All HealthKit queries for Koru, each as a small enum namespace
//  that converts raw HKSamples into the shape HealthSnapshot expects.
//  Compiled only where HealthKit is available.
//

import Foundation
import KoruCore

#if canImport(HealthKit)
import HealthKit

// MARK: - Overnight window helper

enum OvernightWindow {
    /// Previous 20:00 to dayStart 10:00 — captures the overnight
    /// sleep window regardless of user timezone and sleep schedule.
    static func bounds(dayStart: Date) -> (Date, Date) {
        let cal = Calendar.current
        let prevEvening = cal.date(byAdding: .hour, value: -4, to: dayStart) ?? dayStart
        let morningCutoff = cal.date(byAdding: .hour, value: 10, to: dayStart) ?? dayStart
        return (prevEvening, morningCutoff)
    }
}

// MARK: - Statistics helper

private func statisticsQuantity(
    store: HKHealthStore,
    type: HKQuantityType,
    predicate: NSPredicate,
    options: HKStatisticsOptions
) async throws -> HKStatistics? {
    try await withCheckedThrowingContinuation { cont in
        let query = HKStatisticsQuery(
            quantityType: type,
            quantitySamplePredicate: predicate,
            options: options
        ) { _, stats, error in
            if let error = error {
                cont.resume(throwing: HealthError.queryFailed(error.localizedDescription))
            } else {
                cont.resume(returning: stats)
            }
        }
        store.execute(query)
    }
}

// MARK: - HRV

enum HRVQuery {
    static func overnightMedian(store: HKHealthStore, dayStart: Date, dayEnd: Date) async throws -> Double {
        guard let type = HKQuantityType.quantityType(forIdentifier: .heartRateVariabilitySDNN) else {
            throw HealthError.queryFailed("HRV type unavailable")
        }
        let (winStart, winEnd) = OvernightWindow.bounds(dayStart: dayStart)
        let predicate = HKQuery.predicateForSamples(withStart: winStart, end: winEnd)
        let stats = try await statisticsQuantity(store: store, type: type, predicate: predicate, options: .discreteAverage)
        let unit = HKUnit.secondUnit(with: .milli)
        if let avg = stats?.averageQuantity()?.doubleValue(for: unit) {
            return avg
        }
        throw HealthError.queryFailed("No HRV samples in window")
    }
}

// MARK: - Resting HR

enum RestingHRQuery {
    static func dayValue(store: HKHealthStore, dayStart: Date, dayEnd: Date) async throws -> Double {
        guard let type = HKQuantityType.quantityType(forIdentifier: .restingHeartRate) else {
            throw HealthError.queryFailed("Resting HR unavailable")
        }
        let predicate = HKQuery.predicateForSamples(withStart: dayStart, end: dayEnd)
        let stats = try await statisticsQuantity(store: store, type: type, predicate: predicate, options: .discreteAverage)
        if let bpm = stats?.averageQuantity()?.doubleValue(for: HKUnit(from: "count/min")) {
            return bpm
        }
        throw HealthError.queryFailed("No resting HR samples")
    }
}

// MARK: - Sleep (asleep seconds, deep+REM seconds, efficiency)

enum SleepQuery {
    static func nightValues(store: HKHealthStore, dayStart: Date, dayEnd: Date) async throws -> (asleep: Double, deepREM: Double, efficiency: Double) {
        guard let type = HKCategoryType.categoryType(forIdentifier: .sleepAnalysis) else {
            throw HealthError.queryFailed("Sleep type unavailable")
        }
        let (winStart, winEnd) = OvernightWindow.bounds(dayStart: dayStart)
        let predicate = HKQuery.predicateForSamples(withStart: winStart, end: winEnd)

        let samples: [HKCategorySample] = try await withCheckedThrowingContinuation { cont in
            let q = HKSampleQuery(
                sampleType: type,
                predicate: predicate,
                limit: HKObjectQueryNoLimit,
                sortDescriptors: [NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: true)]
            ) { _, results, error in
                if let error = error {
                    cont.resume(throwing: HealthError.queryFailed(error.localizedDescription))
                } else {
                    cont.resume(returning: (results as? [HKCategorySample]) ?? [])
                }
            }
            store.execute(q)
        }

        var asleep: TimeInterval = 0
        var deepREM: TimeInterval = 0
        var inBed: TimeInterval = 0
        for s in samples {
            let dur = s.endDate.timeIntervalSince(s.startDate)
            switch s.value {
            case HKCategoryValueSleepAnalysis.inBed.rawValue:
                inBed += dur
            case HKCategoryValueSleepAnalysis.asleepCore.rawValue:
                asleep += dur
            case HKCategoryValueSleepAnalysis.asleepDeep.rawValue:
                asleep += dur
                deepREM += dur
            case HKCategoryValueSleepAnalysis.asleepREM.rawValue:
                asleep += dur
                deepREM += dur
            case HKCategoryValueSleepAnalysis.asleepUnspecified.rawValue:
                asleep += dur
            default:
                break
            }
        }
        if asleep == 0 { throw HealthError.queryFailed("No sleep samples") }
        let efficiency = inBed > 0 ? (asleep / inBed).clamped(to: 0...1) : 0.9
        return (asleep, deepREM, efficiency)
    }
}

// MARK: - Activity rings

enum ActivityRingsQuery {
    static func dayValues(store: HKHealthStore, day: Date) async throws -> (move: Double, exercise: Double, stand: Double) {
        let cal = Calendar.current
        let components = cal.dateComponents([.year, .month, .day], from: day)
        let predicate = HKQuery.predicate(forActivitySummariesBetweenStart: components, end: components)

        let summary: HKActivitySummary? = try await withCheckedThrowingContinuation { cont in
            let q = HKActivitySummaryQuery(predicate: predicate) { _, summaries, error in
                if let error = error {
                    cont.resume(throwing: HealthError.queryFailed(error.localizedDescription))
                } else {
                    cont.resume(returning: summaries?.first)
                }
            }
            store.execute(q)
        }

        guard let s = summary else { throw HealthError.queryFailed("No activity summary") }
        let kcal = HKUnit.kilocalorie()
        let min = HKUnit.minute()
        let hour = HKUnit.count()

        let moveGoal = s.activeEnergyBurnedGoal.doubleValue(for: kcal)
        let moveValue = s.activeEnergyBurned.doubleValue(for: kcal)
        let exGoal = s.appleExerciseTimeGoal.doubleValue(for: min)
        let exValue = s.appleExerciseTime.doubleValue(for: min)
        let standGoal = s.appleStandHoursGoal.doubleValue(for: hour)
        let standValue = s.appleStandHours.doubleValue(for: hour)

        let moveF = moveGoal > 0 ? moveValue / moveGoal : 0
        let exF = exGoal > 0 ? exValue / exGoal : 0
        let standF = standGoal > 0 ? standValue / standGoal : 0
        return (moveF, exF, standF)
    }
}

// MARK: - Workout load

enum WorkoutLoadQuery {
    static func dayValues(store: HKHealthStore, day: Date) async throws -> (today: Double, sevenDayAverage: Double) {
        let cal = Calendar.current
        let dayStart = cal.startOfDay(for: day)
        let dayEnd = cal.date(byAdding: .day, value: 1, to: dayStart) ?? day
        let weekStart = cal.date(byAdding: .day, value: -7, to: dayStart) ?? day

        let samples: [HKWorkout] = try await withCheckedThrowingContinuation { cont in
            let predicate = HKQuery.predicateForSamples(withStart: weekStart, end: dayEnd)
            let q = HKSampleQuery(
                sampleType: .workoutType(),
                predicate: predicate,
                limit: HKObjectQueryNoLimit,
                sortDescriptors: nil
            ) { _, results, error in
                if let error = error {
                    cont.resume(throwing: HealthError.queryFailed(error.localizedDescription))
                } else {
                    cont.resume(returning: (results as? [HKWorkout]) ?? [])
                }
            }
            store.execute(q)
        }

        // TRIMP-lite: sum of (minutes × intensity proxy). Use active
        // energy burned per minute as the intensity proxy when available.
        func load(_ w: HKWorkout) -> Double {
            let minutes = w.duration / 60
            let kcal = w.totalEnergyBurned?.doubleValue(for: .kilocalorie()) ?? 0
            let intensity = minutes > 0 ? (kcal / minutes) : 0
            return minutes * max(1, intensity / 10)
        }

        let todayLoad = samples
            .filter { $0.startDate >= dayStart && $0.startDate < dayEnd }
            .reduce(0) { $0 + load($1) }
        let weekLoad = samples.reduce(0) { $0 + load($1) } / 7.0
        return (todayLoad, weekLoad)
    }
}

// MARK: - VO2 max

enum VO2MaxQuery {
    static func latest(store: HKHealthStore, before: Date) async throws -> Double {
        guard let type = HKQuantityType.quantityType(forIdentifier: .vo2Max) else {
            throw HealthError.queryFailed("VO2Max type unavailable")
        }
        let predicate = HKQuery.predicateForSamples(withStart: Calendar.current.date(byAdding: .day, value: -30, to: before), end: before)
        let stats = try await statisticsQuantity(store: store, type: type, predicate: predicate, options: .mostRecent)
        let unit = HKUnit(from: "ml/(kg*min)")
        if let q = stats?.mostRecentQuantity()?.doubleValue(for: unit) {
            return q
        }
        throw HealthError.queryFailed("No VO2 samples")
    }
}

// MARK: - SpO2

enum SpO2Query {
    static func overnightMedian(store: HKHealthStore, dayStart: Date, dayEnd: Date) async throws -> Double {
        guard let type = HKQuantityType.quantityType(forIdentifier: .oxygenSaturation) else {
            throw HealthError.queryFailed("SpO2 type unavailable")
        }
        let (winStart, winEnd) = OvernightWindow.bounds(dayStart: dayStart)
        let predicate = HKQuery.predicateForSamples(withStart: winStart, end: winEnd)
        let stats = try await statisticsQuantity(store: store, type: type, predicate: predicate, options: .discreteAverage)
        if let q = stats?.averageQuantity()?.doubleValue(for: .percent()) {
            return q
        }
        throw HealthError.queryFailed("No SpO2 samples")
    }
}

// MARK: - Respiratory rate

enum RespiratoryQuery {
    static func overnightMedian(store: HKHealthStore, dayStart: Date, dayEnd: Date) async throws -> Double {
        guard let type = HKQuantityType.quantityType(forIdentifier: .respiratoryRate) else {
            throw HealthError.queryFailed("Respiratory type unavailable")
        }
        let (winStart, winEnd) = OvernightWindow.bounds(dayStart: dayStart)
        let predicate = HKQuery.predicateForSamples(withStart: winStart, end: winEnd)
        let stats = try await statisticsQuantity(store: store, type: type, predicate: predicate, options: .discreteAverage)
        if let q = stats?.averageQuantity()?.doubleValue(for: HKUnit(from: "count/min")) {
            return q
        }
        throw HealthError.queryFailed("No respiratory samples")
    }
}

// MARK: - Wrist temperature delta

enum WristTempQuery {
    static func overnightDelta(store: HKHealthStore, dayStart: Date, dayEnd: Date) async throws -> Double {
        guard let type = HKQuantityType.quantityType(forIdentifier: .appleSleepingWristTemperature) else {
            throw HealthError.queryFailed("Wrist temp type unavailable")
        }
        let (winStart, winEnd) = OvernightWindow.bounds(dayStart: dayStart)
        let predicate = HKQuery.predicateForSamples(withStart: winStart, end: winEnd)
        let stats = try await statisticsQuantity(store: store, type: type, predicate: predicate, options: .discreteAverage)
        // HealthKit returns this type as a delta in °C already.
        if let q = stats?.averageQuantity()?.doubleValue(for: .degreeCelsius()) {
            return q
        }
        throw HealthError.queryFailed("No wrist temp samples")
    }
}

// MARK: - Mindfulness

enum MindfulnessQuery {
    static func dayMinutes(store: HKHealthStore, day: Date) async throws -> Double {
        guard let type = HKCategoryType.categoryType(forIdentifier: .mindfulSession) else {
            throw HealthError.queryFailed("Mindful session unavailable")
        }
        let cal = Calendar.current
        let dayStart = cal.startOfDay(for: day)
        let dayEnd = cal.date(byAdding: .day, value: 1, to: dayStart) ?? day
        let predicate = HKQuery.predicateForSamples(withStart: dayStart, end: dayEnd)

        let samples: [HKCategorySample] = try await withCheckedThrowingContinuation { cont in
            let q = HKSampleQuery(sampleType: type, predicate: predicate, limit: HKObjectQueryNoLimit, sortDescriptors: nil) { _, results, error in
                if let error = error {
                    cont.resume(throwing: HealthError.queryFailed(error.localizedDescription))
                } else {
                    cont.resume(returning: (results as? [HKCategorySample]) ?? [])
                }
            }
            store.execute(q)
        }

        let totalSeconds = samples.reduce(0.0) { $0 + $1.endDate.timeIntervalSince($1.startDate) }
        return totalSeconds / 60
    }
}

// MARK: - User context

enum UserContextQuery {
    static func ageSex(store: HKHealthStore) async throws -> (age: Int, sex: HealthSnapshot.BiologicalSex) {
        let dob = try? store.dateOfBirthComponents()
        let sexObj = try? store.biologicalSex()

        var age = 35
        if let components = dob,
           let dobDate = Calendar.current.date(from: components) {
            let years = Calendar.current.dateComponents([.year], from: dobDate, to: Date()).year ?? 35
            age = years
        }

        let sex: HealthSnapshot.BiologicalSex
        switch sexObj?.biologicalSex {
        case .female:   sex = .female
        case .male:     sex = .male
        case .other:    sex = .other
        default:        sex = .unknown
        }
        return (age, sex)
    }
}

#endif
