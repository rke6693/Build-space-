//
//  AppModel.swift
//  Koru Watch App
//
//  The top-level observable model. Owns the HealthStore, the rolling
//  WellnessScore, the BaselineBook, the Koru theme (with Night Mode
//  schedule), and the navigation destination.
//

import Foundation
import SwiftUI
import KoruCore
import KoruHealth
import KoruUI

@MainActor
final class AppModel: ObservableObject {

    // MARK: - Published state

    /// True when the user has completed onboarding (all 3 permission
    /// groups reviewed; they can still deny any of them).
    @AppStorage("koru.onboarded") var isOnboarded: Bool = false

    /// Locally-persisted theme choice — .auto by default, .night when
    /// manually toggled or schedule fires.
    @AppStorage("koru.themeRaw") private var themeRaw: String = KoruTheme.auto.rawValue

    /// Night-mode schedule, persisted as JSON.
    @AppStorage("koru.nightSchedule") private var nightScheduleData: Data = Data()

    @Published var todayScore: WellnessScore?
    @Published var recentHistory: [WellnessScore] = []
    @Published var isComputing: Bool = false

    /// Shows the check-in sheet over any screen.
    @Published var showingCheckIn: Bool = false

    // MARK: - Dependencies

    let healthStore: HealthStoreProtocol
    private let history: ScoreHistoryStore
    private let engine: ScoringEngine

    // MARK: - Init

    init(
        healthStore: HealthStoreProtocol = HealthStore(),
        history: ScoreHistoryStore = ScoreHistoryStore(),
        engine: ScoringEngine = ScoringEngine()
    ) {
        self.healthStore = healthStore
        self.history = history
        self.engine = engine
        Task { await loadHistoryAndCompute() }
    }

    // MARK: - Theme

    var manualTheme: KoruTheme {
        get { KoruTheme(rawValue: themeRaw) ?? .auto }
        set { themeRaw = newValue.rawValue }
    }

    var effectiveTheme: KoruTheme {
        if manualTheme == .night { return .night }
        if manualTheme != .auto { return manualTheme }
        // Schedule auto-activation
        let schedule: NightModeSchedule
        if let decoded = try? JSONDecoder().decode(NightModeSchedule.self, from: nightScheduleData) {
            schedule = decoded
        } else {
            schedule = NightModeSchedule()
        }
        return schedule.isActive(at: Date()) ? .night : .auto
    }

    func setTheme(_ theme: KoruTheme) {
        manualTheme = theme
        switch theme {
        case .night: KoruHaptic.nightModeOn.play()
        case .auto, .day, .dark: KoruHaptic.nightModeOff.play()
        }
    }

    // MARK: - Scoring

    func loadHistoryAndCompute() async {
        recentHistory = await history.loadHistory()
        await computeToday()
    }

    func computeToday() async {
        isComputing = true
        defer { isComputing = false }
        let day = Date()
        var baselines = await history.loadBaselines()
        do {
            let snapshot: HealthSnapshot
            if healthStore.isAvailable && isOnboarded {
                snapshot = try await healthStore.snapshot(for: day)
            } else {
                // Previews or fresh install — use a mocked "Strong" state
                // so onboarding can preview the main screen.
                snapshot = MockHealthStore.preset(cycle: 0, day: day)
            }
            engine.observe(snapshot: snapshot, into: &baselines)
            let score = engine.compute(
                snapshot: snapshot,
                baselines: baselines,
                history: recentHistory,
                now: Date()
            )
            todayScore = score
            try await history.append(score)
            try await history.save(baselines: baselines)
            recentHistory = await history.loadHistory()
            KoruHaptic.scoreRevealed.play()
        } catch {
            // Leave todayScore nil — the UI shows a "No data yet" state.
            todayScore = nil
        }
    }

    // MARK: - Check-in

    func presentCheckIn() {
        showingCheckIn = true
        KoruHaptic.checkInTap.play()
    }

    func logCheckIn() async {
        do {
            try await healthStore.logCheckInMindfulSession(
                startedAt: Date().addingTimeInterval(-60),
                durationSeconds: 60
            )
            KoruHaptic.checkInSaved.play()
        } catch {
            // Permissions denied — still haptic-ack the user gesture.
            KoruHaptic.warning.play()
        }
        showingCheckIn = false
    }
}
