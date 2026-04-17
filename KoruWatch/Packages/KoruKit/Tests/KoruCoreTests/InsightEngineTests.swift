//
//  InsightEngineTests.swift
//  KoruCoreTests
//
//  Tests for the InsightEngine pattern detector.
//

import XCTest
@testable import KoruCore

final class InsightEngineTests: XCTestCase {

    private func makeScore(day: Date, value: Int) -> WellnessScore {
        WellnessScore(
            day: day,
            value: value,
            band: ScoreBand.from(value: value),
            trend: 0,
            components: ComponentKind.allCases.map { kind in
                ScoreComponent(
                    kind: kind,
                    rawValue: Double(value),
                    value: value,
                    zScore: 0,
                    effectiveWeight: KoruWeights.nominal[kind] ?? 0,
                    subtitle: ""
                )
            },
            confidence: 1,
            computedAt: day
        )
    }

    private var cal: Calendar { Calendar(identifier: .gregorian) }

    private func history(values: [Int], startingDaysAgo: Int) -> [WellnessScore] {
        let base = Date()
        return values.enumerated().map { i, v in
            let day = cal.date(byAdding: .day, value: -(startingDaysAgo - i), to: base)!
            return makeScore(day: day, value: v)
        }
    }

    func testEmptyHistoryReturnsNoInsights() {
        let insights = InsightEngine.analyze(history: [])
        XCTAssertTrue(insights.isEmpty)
    }

    func testSingleDayReturnsNoInsights() {
        let h = [makeScore(day: Date(), value: 75)]
        let insights = InsightEngine.analyze(history: h)
        XCTAssertTrue(insights.isEmpty, "Need multiple days for patterns")
    }

    func testSevenDayHistoryProducesInsights() {
        let h = history(values: [60, 65, 68, 72, 75, 78, 82], startingDaysAgo: 6)
        let insights = InsightEngine.analyze(history: h)
        XCTAssertFalse(insights.isEmpty, "7 days of improving scores should yield insights")
    }

    func testInsightsCappedAtThree() {
        let h = history(values: [50, 55, 60, 65, 70, 75, 80, 85, 90, 95, 80, 85, 90, 92], startingDaysAgo: 13)
        let insights = InsightEngine.analyze(history: h)
        XCTAssertLessThanOrEqual(insights.count, 3, "Max 3 insights returned")
    }

    func testInsightsSortedByRelevance() {
        let h = history(values: [40, 50, 55, 60, 65, 70, 80, 85, 45, 50, 60, 70, 80, 90], startingDaysAgo: 13)
        let insights = InsightEngine.analyze(history: h)
        guard insights.count >= 2 else { return }
        XCTAssertGreaterThanOrEqual(insights[0].relevance, insights[1].relevance)
    }

    func testInsightKindIsValid() {
        let h = history(values: [60, 65, 70, 75, 80, 78, 82], startingDaysAgo: 6)
        let insights = InsightEngine.analyze(history: h)
        for insight in insights {
            XCTAssertFalse(insight.text.isEmpty, "Insight text should not be empty")
            XCTAssertGreaterThan(insight.relevance, 0, "Relevance should be positive")
            XCTAssertLessThanOrEqual(insight.relevance, 1, "Relevance should be <= 1")
        }
    }
}
