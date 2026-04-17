//
//  WeeklySummaryView.swift
//  Koru Watch App
//
//  End-of-week review card shown as a sheet on Sunday evening or Monday
//  morning. Summarizes the past 7 days with average score, sparkline,
//  best/worst days, and component deltas vs the prior week.
//

import SwiftUI
import KoruCore
import KoruUI

struct WeeklySummaryView: View {
    @EnvironmentObject private var app: AppModel
    @Environment(\.koruTheme) private var theme
    @Environment(\.colorScheme) private var scheme
    @Environment(\.koruDevice) private var device
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        ScrollView {
            VStack(spacing: 12) {
                // Header
                Text("Your Week")
                    .font(KoruFont.sectionHeader)
                    .koruForeground(KoruColors.inkDim)

                Text(dateRangeString)
                    .font(KoruFont.caption)
                    .koruForeground(KoruColors.inkDim)

                // Average score
                Text("\(weekAverage)")
                    .font(KoruFont.scoreNumeral(size: 56))
                    .monospacedDigit()
                    .kerning(-2)
                    .foregroundStyle(
                        AuroraGradient.linear(theme: theme, colorScheme: scheme)
                    )

                Text("average")
                    .font(KoruFont.caption)
                    .koruForeground(KoruColors.inkDim)

                // 7-day sparkline
                TrendSparkline(values: weekValues)
                    .frame(height: 40)
                    .padding(.horizontal, device.horizontalPadding)

                // Best and worst days
                HStack(spacing: 16) {
                    dayStat(label: "Best", dayName: bestDayName, value: bestDayValue, isGood: true)
                    dayStat(label: "Worst", dayName: worstDayName, value: worstDayValue, isGood: false)
                }
                .padding(.horizontal, device.horizontalPadding)

                // Component deltas vs prior week
                if let improving = topImprovingComponent {
                    componentDelta(
                        label: "Improving",
                        component: improving.kind.label,
                        delta: improving.delta,
                        isPositive: true
                    )
                }

                if let declining = needsAttentionComponent {
                    componentDelta(
                        label: "Needs attention",
                        component: declining.kind.label,
                        delta: declining.delta,
                        isPositive: false
                    )
                }

                // Share card preview
                if let latestScore = thisWeekScores.last {
                    ShareCardView.render(score: latestScore)
                        .scaleEffect(0.55)
                        .frame(width: 165, height: 209)
                        .clipShape(RoundedRectangle(cornerRadius: 11))
                        .padding(.top, 4)
                }

                // Dismiss button
                Button(action: { dismiss() }) {
                    Text("Got it")
                        .font(KoruFont.bodyEmphasis)
                        .foregroundStyle(.white)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 10)
                        .background(
                            Capsule()
                                .fill(AuroraGradient.linear(
                                    theme: theme,
                                    colorScheme: scheme
                                ))
                        )
                }
                .buttonStyle(.plain)
                .padding(.horizontal, device.horizontalPadding)
                .padding(.top, 4)
                .padding(.bottom, 8)
            }
        }
    }

    // MARK: - Computed properties

    private var thisWeekScores: [WellnessScore] {
        let sorted = app.recentHistory.sorted { $0.day < $1.day }
        return Array(sorted.suffix(7))
    }

    private var priorWeekScores: [WellnessScore] {
        let sorted = app.recentHistory.sorted { $0.day < $1.day }
        guard sorted.count > 7 else { return [] }
        let prior = sorted.dropLast(7)
        return Array(prior.suffix(7))
    }

    private var weekValues: [Int] {
        thisWeekScores.map(\.value)
    }

    private var weekAverage: Int {
        guard !weekValues.isEmpty else { return 0 }
        return weekValues.reduce(0, +) / weekValues.count
    }

    private var bestDayValue: Int {
        weekValues.max() ?? 0
    }

    private var worstDayValue: Int {
        weekValues.min() ?? 0
    }

    private var bestDayName: String {
        guard let best = thisWeekScores.max(by: { $0.value < $1.value }) else { return "—" }
        return shortDayName(from: best.day)
    }

    private var worstDayName: String {
        guard let worst = thisWeekScores.min(by: { $0.value < $1.value }) else { return "—" }
        return shortDayName(from: worst.day)
    }

    private var dateRangeString: String {
        guard let first = thisWeekScores.first, let last = thisWeekScores.last else {
            return ""
        }
        let fmt = DateFormatter()
        fmt.dateFormat = "MMM d"
        return "\(fmt.string(from: first.day)) – \(fmt.string(from: last.day))"
    }

    // MARK: - Component deltas

    private struct ComponentDelta {
        let kind: ComponentKind
        let delta: Int
    }

    private var componentDeltas: [ComponentDelta] {
        guard !priorWeekScores.isEmpty else { return [] }
        var deltas: [ComponentDelta] = []
        for kind in ComponentKind.allCases {
            let thisValues = thisWeekScores.compactMap { score in
                score.components.first(where: { $0.kind == kind && $0.isAvailable })?.value
            }
            let priorValues = priorWeekScores.compactMap { score in
                score.components.first(where: { $0.kind == kind && $0.isAvailable })?.value
            }
            guard !thisValues.isEmpty && !priorValues.isEmpty else { continue }
            let thisAvg = thisValues.reduce(0, +) / thisValues.count
            let priorAvg = priorValues.reduce(0, +) / priorValues.count
            deltas.append(ComponentDelta(kind: kind, delta: thisAvg - priorAvg))
        }
        return deltas
    }

    private var topImprovingComponent: ComponentDelta? {
        componentDeltas.filter { $0.delta > 0 }.max(by: { $0.delta < $1.delta })
    }

    private var needsAttentionComponent: ComponentDelta? {
        componentDeltas.filter { $0.delta < 0 }.min(by: { $0.delta < $1.delta })
    }

    // MARK: - Subviews

    @ViewBuilder
    private func dayStat(label: String, dayName: String, value: Int, isGood: Bool) -> some View {
        VStack(spacing: 2) {
            Text(label)
                .font(KoruFont.caption)
                .koruForeground(KoruColors.inkDim)
            Text("\(value)")
                .font(KoruFont.scoreNumeral(size: 28))
                .monospacedDigit()
                .foregroundStyle(isGood
                    ? KoruColors.auroraTeal.resolve(theme, colorScheme: scheme)
                    : KoruColors.auroraCoral.resolve(theme, colorScheme: scheme)
                )
            Text(dayName)
                .font(KoruFont.caption)
                .koruForeground(KoruColors.inkDim)
        }
        .frame(maxWidth: .infinity)
    }

    @ViewBuilder
    private func componentDelta(label: String, component: String, delta: Int, isPositive: Bool) -> some View {
        HStack(spacing: 6) {
            VStack(alignment: .leading, spacing: 1) {
                Text(label.uppercased())
                    .font(KoruFont.caption)
                    .koruForeground(KoruColors.inkDim)
                Text(component)
                    .font(KoruFont.bodyEmphasis)
                    .koruForeground(KoruColors.ink)
            }
            Spacer()
            Text(isPositive ? "+\(delta)" : "\(delta)")
                .font(KoruFont.bodyEmphasis)
                .monospacedDigit()
                .foregroundStyle(isPositive
                    ? KoruColors.auroraTeal.resolve(theme, colorScheme: scheme)
                    : KoruColors.auroraCoral.resolve(theme, colorScheme: scheme)
                )
        }
        .padding(.horizontal, device.horizontalPadding)
    }

    // MARK: - Helpers

    private func shortDayName(from date: Date) -> String {
        let fmt = DateFormatter()
        fmt.dateFormat = "EEE"
        return fmt.string(from: date)
    }
}
