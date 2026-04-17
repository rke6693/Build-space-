//
//  PreviewProviders.swift
//  Koru Watch App
//
//  SwiftUI Preview providers for the 6 most important views. Uses
//  realistic sample data so designers and developers can iterate on
//  layouts without running on hardware.
//

import SwiftUI
import KoruCore
import KoruHealth
import KoruUI

// MARK: - Preview data

enum PreviewData {

    /// A "strong" day score — the most common positive state.
    static var sampleScore: WellnessScore {
        let components: [ScoreComponent] = [
            ScoreComponent(kind: .hrv,              rawValue: 68,   value: 78, zScore: 0.8,  effectiveWeight: 0.15, subtitle: "68 ms · +6 vs 14-day"),
            ScoreComponent(kind: .restingHeartRate,  rawValue: 53,   value: 82, zScore: 0.9,  effectiveWeight: 0.12, subtitle: "53 bpm · -3 vs baseline"),
            ScoreComponent(kind: .sleep,             rawValue: 28080, value: 80, zScore: 0.7,  effectiveWeight: 0.15, subtitle: "7h 48m · 93% efficiency"),
            ScoreComponent(kind: .activityRings,     rawValue: 1.05, value: 85, zScore: 1.0,  effectiveWeight: 0.10, subtitle: "Rings closed"),
            ScoreComponent(kind: .workoutLoad,       rawValue: 240,  value: 72, zScore: 0.3,  effectiveWeight: 0.10, subtitle: "240 load · +9% vs avg"),
            ScoreComponent(kind: .vo2Max,            rawValue: 48,   value: 88, zScore: 1.2,  effectiveWeight: 0.10, subtitle: "48 ml/kg/min"),
            ScoreComponent(kind: .spo2,              rawValue: 0.97, value: 75, zScore: 0.4,  effectiveWeight: 0.07, subtitle: "97% overnight"),
            ScoreComponent(kind: .respiratoryRate,   rawValue: 13.8, value: 76, zScore: -0.2, effectiveWeight: 0.07, subtitle: "13.8 bpm"),
            ScoreComponent(kind: .wristTemperature,  rawValue: 0.05, value: 80, zScore: -0.1, effectiveWeight: 0.07, subtitle: "+0.05 °C"),
            ScoreComponent(kind: .mindfulness,       rawValue: 10,   value: 70, zScore: 0.5,  effectiveWeight: 0.07, subtitle: "10 min"),
        ]
        return WellnessScore(
            day: Date(),
            value: 82,
            band: .strong,
            trend: 3,
            components: components,
            confidence: 0.92,
            computedAt: Date()
        )
    }

    /// 7 days of realistic history with natural variation.
    static var sampleHistory: [WellnessScore] {
        let calendar = Calendar.current
        let today = calendar.startOfDay(for: Date())
        let dayValues: [(Int, ScoreBand, Int)] = [
            (71, .strong,  -2),  // 6 days ago
            (65, .steady,   1),  // 5 days ago
            (58, .steady,  -4),  // 4 days ago
            (47, .recover, -8),  // 3 days ago
            (63, .steady,   5),  // 2 days ago
            (76, .strong,   7),  // yesterday
            (82, .strong,   3),  // today
        ]
        return dayValues.enumerated().map { index, data in
            let day = calendar.date(byAdding: .day, value: index - 6, to: today)!
            return WellnessScore(
                day: day,
                value: data.0,
                band: data.1,
                trend: data.2,
                components: sampleScore.components,
                confidence: 0.9,
                computedAt: day
            )
        }
    }

    /// Pre-configured AppModel with mock store and onboarded state.
    @MainActor
    static var sampleModel: AppModel {
        let model = AppModel(
            healthStore: MockHealthStore(),
            history: ScoreHistoryStore(),
            engine: ScoringEngine()
        )
        model.isOnboarded = true
        model.todayScore = sampleScore
        model.recentHistory = sampleHistory
        return model
    }
}

// MARK: - Preview blocks

#Preview("Score Screen") {
    ScoreScreen()
        .environmentObject(PreviewData.sampleModel)
        .environment(\.koruTheme, .dark)
        .environment(\.koruDevice, .ultra2)
}

#Preview("Trend Screen") {
    TrendScreen()
        .environmentObject(PreviewData.sampleModel)
        .environment(\.koruTheme, .dark)
        .environment(\.koruDevice, .ultra2)
}

#Preview("Insights Screen") {
    InsightsScreen()
        .environmentObject(PreviewData.sampleModel)
        .environment(\.koruTheme, .dark)
        .environment(\.koruDevice, .ultra2)
}

#Preview("Check-In Sheet") {
    CheckInSheet()
        .environmentObject(PreviewData.sampleModel)
        .environment(\.koruTheme, .dark)
        .environment(\.koruDevice, .ultra2)
}

#Preview("Onboarding Flow") {
    OnboardingFlow()
        .environmentObject(PreviewData.sampleModel)
        .environment(\.koruTheme, .dark)
        .environment(\.koruDevice, .ultra2)
}

#Preview("Component Detail") {
    ComponentDetailView(
        component: PreviewData.sampleScore.components.first!,
        history: PreviewData.sampleHistory
    )
    .environment(\.koruTheme, .dark)
    .environment(\.koruDevice, .ultra2)
}
