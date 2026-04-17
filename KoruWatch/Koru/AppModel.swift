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

    /// Currently pending milestone celebration (nil = no milestone to show).
    @Published var pendingMilestone: Milestone? = nil

    /// Triggers the weekly summary sheet on Monday morning.
    @Published var showWeeklySummary: Bool = false

    /// Persisted set of milestone IDs that have already been shown.
    @AppStorage("koru.shownMilestoneIDs") private var shownMilestoneIDsData: Data = Data()

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

            // Check for milestones
            let newMilestones = MilestoneEngine.check(
                score: score,
                history: recentHistory,
                shownIDs: loadShownMilestoneIDs()
            )
            if let first = newMilestones.first {
                pendingMilestone = first
            }

            // Trigger weekly summary on Monday morning
            checkWeeklySummary()
        } catch {
            // Leave todayScore nil — the UI shows a "No data yet" state.
            todayScore = nil
        }
    }

    // MARK: - Milestones

    /// Dismiss the current milestone and persist its ID so it won't show again.
    func dismissMilestone() {
        guard let milestone = pendingMilestone else { return }
        var ids = loadShownMilestoneIDs()
        ids.insert(milestone.id)
        saveShownMilestoneIDs(ids)
        pendingMilestone = nil
    }

    private func loadShownMilestoneIDs() -> Set<String> {
        guard !shownMilestoneIDsData.isEmpty,
              let decoded = try? JSONDecoder().decode(Set<String>.self, from: shownMilestoneIDsData)
        else { return [] }
        return decoded
    }

    private func saveShownMilestoneIDs(_ ids: Set<String>) {
        if let data = try? JSONEncoder().encode(ids) {
            shownMilestoneIDsData = data
        }
    }

    // MARK: - Weekly Summary

    /// Check if it's Monday morning and the last 7 days have scores,
    /// then trigger the weekly summary sheet.
    private func checkWeeklySummary() {
        let calendar = Calendar.current
        let weekday = calendar.component(.weekday, from: Date())
        // Sunday = 1, Monday = 2
        guard weekday == 1 || weekday == 2 else { return }
        guard recentHistory.count >= 7 else { return }
        showWeeklySummary = true
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
