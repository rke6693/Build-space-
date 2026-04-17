//
//  ComponentScorerTests.swift
//  KoruCoreTests
//
//  Per-component scorer tests covering edge cases, boundary conditions,
//  and polarity correctness. Each scorer is tested in isolation.
//

import XCTest
@testable import KoruCore

final class ComponentScorerTests: XCTestCase {

    let baselines = BaselineBook()

    // MARK: - HRV

    func testHRVAvailableWhenPresent() {
        var snap = HealthSnapshot(day: Date())
        snap.hrvSDNN = 60
        snap.ageYears = 35
        let c = HRVScorer.score(snapshot: snap, baselines: baselines)
        XCTAssertTrue(c.isAvailable)
        XCTAssertEqual(c.kind, .hrv)
        XCTAssertTrue(c.value >= 0 && c.value <= 100)
    }

    func testHRVUnavailableWhenMissing() {
        let snap = HealthSnapshot(day: Date())
        let c = HRVScorer.score(snapshot: snap, baselines: baselines)
        XCTAssertFalse(c.isAvailable)
        XCTAssertEqual(c.effectiveWeight, 0)
    }

    func testHRVHigherIsBetter() {
        var low = HealthSnapshot(day: Date())
        low.hrvSDNN = 20; low.ageYears = 35
        var high = HealthSnapshot(day: Date())
        high.hrvSDNN = 90; high.ageYears = 35
        let lowScore = HRVScorer.score(snapshot: low, baselines: baselines).value
        let highScore = HRVScorer.score(snapshot: high, baselines: baselines).value
        XCTAssertGreaterThan(highScore, lowScore, "Higher HRV should produce higher score")
    }

    // MARK: - Resting HR

    func testRestingHRLowerIsBetter() {
        var low = HealthSnapshot(day: Date())
        low.restingHeartRate = 48; low.ageYears = 35
        var high = HealthSnapshot(day: Date())
        high.restingHeartRate = 78; high.ageYears = 35
        let lowScore = RestingHRScorer.score(snapshot: low, baselines: baselines).value
        let highScore = RestingHRScorer.score(snapshot: high, baselines: baselines).value
        XCTAssertGreaterThan(lowScore, highScore, "Lower RHR should produce higher score")
    }

    // MARK: - Sleep

    func testSleepDurationImpactsScore() {
        var short = HealthSnapshot(day: Date())
        short.sleepAsleepSeconds = 4 * 3600
        short.sleepDeepREMSeconds = 0.8 * 3600
        short.sleepEfficiency = 0.85
        short.ageYears = 35

        var long = HealthSnapshot(day: Date())
        long.sleepAsleepSeconds = 8 * 3600
        long.sleepDeepREMSeconds = 2 * 3600
        long.sleepEfficiency = 0.95
        long.ageYears = 35

        let shortScore = SleepScorer.score(snapshot: short, baselines: baselines).value
        let longScore = SleepScorer.score(snapshot: long, baselines: baselines).value
        XCTAssertGreaterThan(longScore, shortScore, "Longer sleep should score higher")
    }

    func testSleepUnavailableWithoutData() {
        let snap = HealthSnapshot(day: Date())
        XCTAssertFalse(SleepScorer.score(snapshot: snap, baselines: baselines).isAvailable)
    }

    // MARK: - Activity rings

    func testClosedRingsScoreHigh() {
        var snap = HealthSnapshot(day: Date())
        snap.moveFraction = 1.0
        snap.exerciseFraction = 1.0
        snap.standFraction = 1.0
        let c = ActivityRingScorer.score(snapshot: snap, baselines: baselines)
        XCTAssertGreaterThanOrEqual(c.value, 90, "Closed rings should score >=90")
    }

    func testPartialRingsScoreLower() {
        var snap = HealthSnapshot(day: Date())
        snap.moveFraction = 0.5
        snap.exerciseFraction = 0.3
        snap.standFraction = 0.6
        let c = ActivityRingScorer.score(snapshot: snap, baselines: baselines)
        XCTAssertLessThan(c.value, 60)
    }

    // MARK: - Workout load

    func testWorkoutOverloadPenalizes() {
        var snap = HealthSnapshot(day: Date())
        snap.workoutLoadToday = 600
        snap.workoutLoad7dAvg = 200
        let c = WorkoutScorer.score(snapshot: snap, baselines: baselines)
        XCTAssertLessThan(c.value, 50, "3x overload should penalize")
    }

    func testWorkoutBalancedScoresHigh() {
        var snap = HealthSnapshot(day: Date())
        snap.workoutLoadToday = 200
        snap.workoutLoad7dAvg = 200
        let c = WorkoutScorer.score(snapshot: snap, baselines: baselines)
        XCTAssertGreaterThanOrEqual(c.value, 90, "Balanced load = peak")
    }

    // MARK: - SpO2

    func testSpO2HealthyIsFullScore() {
        var snap = HealthSnapshot(day: Date())
        snap.spo2 = 0.98
        let c = SpO2Scorer.score(snapshot: snap, baselines: baselines)
        XCTAssertEqual(c.value, 100)
    }

    func testSpO2LowDropsSharply() {
        var snap = HealthSnapshot(day: Date())
        snap.spo2 = 0.91
        let c = SpO2Scorer.score(snapshot: snap, baselines: baselines)
        XCTAssertLessThan(c.value, 45)
    }

    // MARK: - Respiratory rate (bidirectional)

    func testRespiratoryDeviationEitherWayPenalizes() {
        // Setup personal baseline at 14
        var book = BaselineBook()
        var stats = BaselineStats()
        let cal = Calendar(identifier: .gregorian)
        let base = Date()
        for i in 0..<14 {
            stats.observe(14.0, at: cal.date(byAdding: .day, value: -i, to: base)!)
        }
        book[.respiratoryRate] = stats

        var high = HealthSnapshot(day: base)
        high.respiratoryRate = 20
        var low = HealthSnapshot(day: base)
        low.respiratoryRate = 9
        var normal = HealthSnapshot(day: base)
        normal.respiratoryRate = 14

        let normalScore = RespiratoryScorer.score(snapshot: normal, baselines: book).value
        let highScore = RespiratoryScorer.score(snapshot: high, baselines: book).value
        let lowScore = RespiratoryScorer.score(snapshot: low, baselines: book).value

        XCTAssertGreaterThan(normalScore, highScore, "Normal should beat high")
        XCTAssertGreaterThan(normalScore, lowScore, "Normal should beat low")
    }

    // MARK: - Wrist temperature (bidirectional)

    func testWristTempNoDeviationIsIdeal() {
        var snap = HealthSnapshot(day: Date())
        snap.wristTemperatureDeltaC = 0.0
        let c = WristTempScorer.score(snapshot: snap, baselines: baselines)
        XCTAssertEqual(c.value, 100)
    }

    func testWristTempLargeDeviationPenalizes() {
        var snap = HealthSnapshot(day: Date())
        snap.wristTemperatureDeltaC = 0.8
        let c = WristTempScorer.score(snapshot: snap, baselines: baselines)
        XCTAssertLessThan(c.value, 30)
    }

    // MARK: - Mindfulness

    func testMindfulnessAtTargetIsMax() {
        var snap = HealthSnapshot(day: Date())
        snap.mindfulMinutes = 10
        let c = MindfulnessScorer.score(snapshot: snap, baselines: baselines)
        XCTAssertEqual(c.value, 100)
    }

    func testMindfulnessZeroStillAvailable() {
        var snap = HealthSnapshot(day: Date())
        snap.mindfulMinutes = 0
        let c = MindfulnessScorer.score(snapshot: snap, baselines: baselines)
        XCTAssertTrue(c.rawValue != nil, "0 minutes should still be 'available'")
        XCTAssertLessThan(c.value, 50)
    }

    // MARK: - VO2 max

    func testVO2MaxHigherIsBetter() {
        var low = HealthSnapshot(day: Date())
        low.vo2Max = 25; low.ageYears = 35
        var high = HealthSnapshot(day: Date())
        high.vo2Max = 55; high.ageYears = 35
        let lowScore = VO2MaxScorer.score(snapshot: low, baselines: baselines).value
        let highScore = VO2MaxScorer.score(snapshot: high, baselines: baselines).value
        XCTAssertGreaterThan(highScore, lowScore)
    }
}
