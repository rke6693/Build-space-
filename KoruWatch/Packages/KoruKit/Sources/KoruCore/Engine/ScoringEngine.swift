//
//  ScoringEngine.swift
//  KoruCore
//
//  The heart of Koru. Takes a HealthSnapshot + BaselineBook and
//  returns a fully-formed WellnessScore. Pure, deterministic, Sendable.
//

import Foundation

public struct ScoringEngine: Sendable {

    public init() {}

    /// Compute the wellness score for the given snapshot.
    ///
    /// - Parameters:
    ///   - snapshot: Today's health data (may contain nils).
    ///   - baselines: Rolling personal baseline stats.
    ///   - history: Recent daily scores used only for trend calculation.
    ///   - now: Clock injection for deterministic tests.
    public func compute(
        snapshot: HealthSnapshot,
        baselines: BaselineBook,
        history: [WellnessScore] = [],
        now: Date = .init()
    ) -> WellnessScore {

        // 1) Run every component scorer.
        let raw: [ScoreComponent] = [
            HRVScorer.score(snapshot: snapshot,        baselines: baselines),
            RestingHRScorer.score(snapshot: snapshot,  baselines: baselines),
            SleepScorer.score(snapshot: snapshot,      baselines: baselines),
            ActivityRingScorer.score(snapshot: snapshot, baselines: baselines),
            WorkoutScorer.score(snapshot: snapshot,    baselines: baselines),
            VO2MaxScorer.score(snapshot: snapshot,     baselines: baselines),
            SpO2Scorer.score(snapshot: snapshot,       baselines: baselines),
            RespiratoryScorer.score(snapshot: snapshot, baselines: baselines),
            WristTempScorer.score(snapshot: snapshot,  baselines: baselines),
            MindfulnessScorer.score(snapshot: snapshot, baselines: baselines),
        ]

        // 2) Redistribute weights across available components.
        let available = raw.filter { $0.isAvailable }
        let unavailable = raw.filter { !$0.isAvailable }

        let availableNominal = available.reduce(0) { $0 + KoruWeights.nominal[$1.kind, default: 0] }
        let components: [ScoreComponent]
        if availableNominal > 0 {
            let scale = 1.0 / availableNominal
            let redistributed = available.map { c -> ScoreComponent in
                ScoreComponent(
                    kind: c.kind,
                    rawValue: c.rawValue,
                    value: c.value,
                    zScore: c.zScore,
                    effectiveWeight: (KoruWeights.nominal[c.kind] ?? 0) * scale,
                    subtitle: c.subtitle
                )
            }
            components = redistributed + unavailable
        } else {
            components = raw
        }

        // 3) Weighted sum → 0–100.
        let weightedTotal = components
            .filter { $0.isAvailable }
            .reduce(0.0) { $0 + Double($1.value) * $1.effectiveWeight }
        let value = Int(weightedTotal.rounded()).clamped(to: 0...100)
        let band = ScoreBand.from(value: value)

        // 4) Trend — diff vs trailing 7-day average of prior scores.
        let lookback = history
            .sorted { $0.day > $1.day }
            .prefix(7)
        let trend: Int
        if lookback.isEmpty {
            trend = 0
        } else {
            let avg = lookback.reduce(0) { $0 + $1.value } / lookback.count
            trend = value - avg
        }

        // 5) Confidence — fraction of components populated, scaled by
        //    average baseline maturity.
        let coverage = Double(available.count) / 10.0
        let maturities = ComponentKind.allCases.map { baselines.blendAlpha(for: $0) }
        let avgMaturity = maturities.reduce(0, +) / Double(maturities.count)
        let confidence = (0.6 * coverage + 0.4 * avgMaturity).clamped(to: 0...1)

        return WellnessScore(
            day: snapshot.day,
            value: value,
            band: band,
            trend: trend,
            components: components.sorted { keyFor($0) < keyFor($1) },
            confidence: confidence,
            computedAt: now
        )
    }

    // Preserve a stable display order for components regardless of
    // availability — ring/widget rendering relies on this.
    private func keyFor(_ c: ScoreComponent) -> Int {
        ComponentKind.allCases.firstIndex(of: c.kind) ?? 99
    }

    // MARK: - Baseline observation

    /// Merge a computed snapshot back into the BaselineBook so future
    /// scores have richer personal statistics. Call this after a
    /// successful compute and persist the result.
    public func observe(
        snapshot: HealthSnapshot,
        into baselines: inout BaselineBook
    ) {
        // HRV
        if let v = snapshot.hrvSDNN {
            baselines[.hrv].observe(v, at: snapshot.day)
        }
        if let v = snapshot.restingHeartRate {
            baselines[.restingHeartRate].observe(v, at: snapshot.day)
        }
        if let v = snapshot.sleepAsleepSeconds {
            baselines[.sleep].observe(v, at: snapshot.day)
        }
        if let v = snapshot.vo2Max {
            baselines[.vo2Max].observe(v, at: snapshot.day)
        }
        if let v = snapshot.spo2 {
            baselines[.spo2].observe(v, at: snapshot.day)
        }
        if let v = snapshot.respiratoryRate {
            baselines[.respiratoryRate].observe(v, at: snapshot.day)
        }
        // Wrist temp, activity, workouts, mindfulness are self-relative
        // or behavioural and don't feed the baseline book.
    }
}
