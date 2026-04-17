//
//  ZScoreTests.swift
//  KoruCoreTests
//
//  Numerical stability and edge-case tests for the z-score utilities.
//

import XCTest
@testable import KoruCore

final class ZScoreTests: XCTestCase {

    func testZScoreZeroStdDevReturnsZero() {
        let z = ZScoreMath.zScore(value: 100, mean: 50, stdDev: 0)
        XCTAssertEqual(z, 0, "Zero stdDev should return 0, not NaN or Inf")
    }

    func testZScoreVerySmallStdDevReturnsZero() {
        let z = ZScoreMath.zScore(value: 100, mean: 50, stdDev: 0.00001)
        XCTAssertEqual(z, 0, "Below epsilon threshold should return 0")
    }

    func testZScoreNormalCase() {
        let z = ZScoreMath.zScore(value: 80, mean: 50, stdDev: 10)
        XCTAssertEqual(z, 3.0, accuracy: 0.01)
    }

    func testClampLimitsToThree() {
        XCTAssertEqual(ZScoreMath.clamp(5.0), 3.0)
        XCTAssertEqual(ZScoreMath.clamp(-5.0), -3.0)
        XCTAssertEqual(ZScoreMath.clamp(1.5), 1.5)
    }

    func testSigmoidAtZeroIsExactly50() {
        XCTAssertEqual(ZScoreMath.sigmoidScore(z: 0, polarity: .positive), 50)
        XCTAssertEqual(ZScoreMath.sigmoidScore(z: 0, polarity: .negative), 50)
        XCTAssertEqual(ZScoreMath.sigmoidScore(z: 0, polarity: .bidirectional), 50)
    }

    func testSigmoidBoundedByZeroAndHundred() {
        for z in stride(from: -5.0, through: 5.0, by: 0.5) {
            for polarity in [Polarity.positive, .negative, .bidirectional] {
                let s = ZScoreMath.sigmoidScore(z: z, polarity: polarity)
                XCTAssertGreaterThanOrEqual(s, 0, "Score out of bounds at z=\(z) pol=\(polarity)")
                XCTAssertLessThanOrEqual(s, 100, "Score out of bounds at z=\(z) pol=\(polarity)")
            }
        }
    }

    func testSigmoidSymmetry() {
        let pos = ZScoreMath.sigmoidScore(z: 2, polarity: .positive)
        let neg = ZScoreMath.sigmoidScore(z: -2, polarity: .positive)
        XCTAssertEqual(pos + neg, 100, accuracy: 1, "Sigmoid should be roughly symmetric around 50")
    }

    func testClampedExtension() {
        XCTAssertEqual(5.clamped(to: 0...10), 5)
        XCTAssertEqual((-3).clamped(to: 0...10), 0)
        XCTAssertEqual(15.clamped(to: 0...10), 10)
        XCTAssertEqual(0.5.clamped(to: 0.0...1.0), 0.5)
        XCTAssertEqual((-0.5).clamped(to: 0.0...1.0), 0.0)
    }
}

final class BaselineBlenderTests: XCTestCase {

    func testDay0AlphaIsZero() {
        let book = BaselineBook()
        XCTAssertEqual(book.blendAlpha(for: .hrv), 0, accuracy: 0.001)
    }

    func testDay14AlphaIsOne() {
        var stats = BaselineStats()
        let base = Date()
        let cal = Calendar(identifier: .gregorian)
        for i in 0..<14 {
            stats.observe(50 + Double(i), at: cal.date(byAdding: .day, value: -i, to: base)!)
        }
        let book = BaselineBook(perComponent: [.hrv: stats])
        XCTAssertEqual(book.blendAlpha(for: .hrv), 1.0, accuracy: 0.001)
    }

    func testBlendLeansToPop0OnDay1() {
        let personal = BaselineStats(n: 1, mean: 80, m2: 0, lastUpdated: Date())
        let pop = PopulationNorm(mean: 50, stdDev: 14)
        let b = BaselineBlender.blend(kind: .hrv, personal: personal, population: pop)
        // Alpha at n=1 should be very low (~0.005 via smoothstep)
        XCTAssertLessThan(b.alpha, 0.05, "Day 1 should lean toward population")
        XCTAssertEqual(b.mean, pop.mean, accuracy: 3, "Mean should be near population norm on day 1")
    }

    func testPopulationNormsHRVDecreasesWithAge() {
        let young = PopulationNorms.hrvSDNN(age: 25, sex: .unknown)
        let old = PopulationNorms.hrvSDNN(age: 65, sex: .unknown)
        XCTAssertGreaterThan(young.mean, old.mean, "HRV should decline with age")
    }

    func testDuplicateDayObservationIgnored() {
        var stats = BaselineStats()
        let day = Date()
        stats.observe(50, at: day)
        XCTAssertEqual(stats.n, 1)
        stats.observe(100, at: day)
        XCTAssertEqual(stats.n, 1, "Second observation on same day should be ignored")
        XCTAssertEqual(stats.mean, 50, accuracy: 0.01, "Mean should not change on duplicate day")
    }
}
