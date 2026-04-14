//
//  ScoringEngineTests.swift
//  KoruCoreTests
//

import XCTest
@testable import KoruCore

final class ScoringEngineTests: XCTestCase {

    // MARK: - Weights invariants

    func testNominalWeightsSumToOne() {
        XCTAssertEqual(KoruWeights.nominalSum, 1.0, accuracy: 0.0001)
    }

    func testEveryComponentHasWeightAndPolarity() {
        for kind in ComponentKind.allCases {
            XCTAssertNotNil(KoruWeights.nominal[kind], "missing weight: \(kind)")
            XCTAssertNotNil(KoruWeights.polarity[kind], "missing polarity: \(kind)")
        }
    }

    // MARK: - End-to-end compute

    func testPeakDayProducesHighScore() {
        let engine = ScoringEngine()
        let snap = Fixtures.peak()
        let score = engine.compute(snapshot: snap, baselines: BaselineBook())
        XCTAssertGreaterThanOrEqual(score.value, 75, "peak fixture should score ≥75, got \(score.value)")
        XCTAssertTrue(score.band == .strong || score.band == .peak)
    }

    func testRecoverDayProducesLowScore() {
        let engine = ScoringEngine()
        let snap = Fixtures.recover()
        let score = engine.compute(snapshot: snap, baselines: BaselineBook())
        XCTAssertLessThan(score.value, 60, "recover fixture should score <60, got \(score.value)")
        XCTAssertTrue(score.band == .recover || score.band == .steady)
    }

    func testPartialDataRedistributesWeights() {
        let engine = ScoringEngine()
        let snap = Fixtures.partial()
        let score = engine.compute(snapshot: snap, baselines: BaselineBook())

        // Available components should have effective weights summing to 1
        let availableWeightSum = score.components
            .filter { $0.isAvailable }
            .reduce(0.0) { $0 + $1.effectiveWeight }
        XCTAssertEqual(availableWeightSum, 1.0, accuracy: 0.001)

        // Unavailable components should have effective weight 0
        let unavailableWeightSum = score.components
            .filter { !$0.isAvailable }
            .reduce(0.0) { $0 + $1.effectiveWeight }
        XCTAssertEqual(unavailableWeightSum, 0, accuracy: 0.001)
    }

    func testTrendIsZeroOnFirstDay() {
        let engine = ScoringEngine()
        let snap = Fixtures.peak()
        let score = engine.compute(snapshot: snap, baselines: BaselineBook(), history: [])
        XCTAssertEqual(score.trend, 0)
    }

    func testTrendReflectsHistoryAverage() {
        let engine = ScoringEngine()
        let day = Fixtures.dayStart
        let cal = Calendar(identifier: .gregorian)

        // 7 prior days at value 50
        let history: [WellnessScore] = (1...7).map { i in
            WellnessScore(
                day: cal.date(byAdding: .day, value: -i, to: day)!,
                value: 50,
                band: .steady,
                trend: 0,
                components: [],
                confidence: 1,
                computedAt: day
            )
        }

        let snap = Fixtures.peak(day: day)
        let score = engine.compute(snapshot: snap, baselines: BaselineBook(), history: history)
        XCTAssertEqual(score.trend, score.value - 50)
    }

    // MARK: - Component-level sanity

    func testSigmoidMonotonic() {
        let lo = ZScoreMath.sigmoidScore(z: -2, polarity: .positive)
        let mid = ZScoreMath.sigmoidScore(z: 0, polarity: .positive)
        let hi = ZScoreMath.sigmoidScore(z: 2, polarity: .positive)
        XCTAssertLessThan(lo, mid)
        XCTAssertLessThan(mid, hi)
        XCTAssertEqual(mid, 50)
    }

    func testSigmoidNegativePolarityInverts() {
        let lo = ZScoreMath.sigmoidScore(z: -2, polarity: .negative)
        let hi = ZScoreMath.sigmoidScore(z: 2, polarity: .negative)
        XCTAssertGreaterThan(lo, hi)   // negative polarity means lower z = better
    }

    func testSigmoidBidirectionalPenalty() {
        let at = ZScoreMath.sigmoidScore(z: 0, polarity: .bidirectional)
        let off = ZScoreMath.sigmoidScore(z: 2, polarity: .bidirectional)
        XCTAssertEqual(at, 50)
        XCTAssertLessThan(off, at)
    }

    // MARK: - Baseline blending

    func testBaselineAlphaRampsOver14Days() {
        var stats = BaselineStats()
        let cal = Calendar(identifier: .gregorian)
        let base = Fixtures.dayStart
        XCTAssertEqual(BaselineBook(perComponent: [.hrv: stats]).blendAlpha(for: .hrv), 0, accuracy: 0.01)

        for i in 0..<14 {
            let day = cal.date(byAdding: .day, value: i, to: base)!
            stats.observe(60 + Double(i), at: day)
        }
        let book = BaselineBook(perComponent: [.hrv: stats])
        XCTAssertEqual(book.blendAlpha(for: .hrv), 1.0, accuracy: 0.01)

        // Halfway through, alpha should be between 0.4 and 0.6 (smoothstep)
        var midStats = BaselineStats()
        for i in 0..<7 {
            midStats.observe(60 + Double(i), at: cal.date(byAdding: .day, value: i, to: base)!)
        }
        let midAlpha = BaselineBook(perComponent: [.hrv: midStats]).blendAlpha(for: .hrv)
        XCTAssertGreaterThan(midAlpha, 0.4)
        XCTAssertLessThan(midAlpha, 0.7)
    }

    func testScoreClampedTo0_100() {
        var snap = Fixtures.peak()
        snap.hrvSDNN = 9999         // absurd value, clamped by z-score
        snap.vo2Max = 100
        let score = ScoringEngine().compute(snapshot: snap, baselines: BaselineBook())
        XCTAssertLessThanOrEqual(score.value, 100)
        XCTAssertGreaterThanOrEqual(score.value, 0)
    }

    // MARK: - Confidence

    func testConfidenceRisesWithCoverage() {
        let engine = ScoringEngine()
        let full = engine.compute(snapshot: Fixtures.peak(), baselines: BaselineBook())
        let partial = engine.compute(snapshot: Fixtures.partial(), baselines: BaselineBook())
        XCTAssertGreaterThan(full.confidence, partial.confidence)
    }
}
