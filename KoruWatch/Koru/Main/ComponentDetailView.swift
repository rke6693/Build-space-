//
//  ComponentDetailView.swift
//  Koru Watch App
//
//  Drill-down sheet shown when the user taps a ContributorRow on the
//  insights page. Displays the component's current value, 7-day
//  sparkline, baseline comparison, score impact, and an educational
//  explanation paragraph per component kind.
//

import SwiftUI
import KoruCore
import KoruUI

struct ComponentDetailView: View {
    let component: ScoreComponent
    let history: [WellnessScore]

    @Environment(\.dismiss) private var dismiss
    @Environment(\.koruDevice) private var device
    @Environment(\.koruTheme) private var theme
    @Environment(\.colorScheme) private var scheme

    // MARK: - Derived data

    /// Extract the last 7 values of this component kind from history.
    private var sparklineValues: [Int] {
        let sorted = history
            .sorted { $0.day < $1.day }
            .suffix(7)
        return sorted.compactMap { score in
            score.components.first(where: { $0.kind == component.kind && $0.isAvailable })?.value
        }
    }

    /// Baseline comparison text.
    private var baselineComparison: String {
        let z = component.zScore
        if abs(z) < 0.3 {
            return "Right at your baseline"
        } else if z > 0 {
            return "Above your baseline"
        } else {
            return "Below your baseline"
        }
    }

    /// Score impact badge text and sign.
    private var impactText: String {
        let weighted = Double(component.value - 50) * component.effectiveWeight
        let rounded = Int(weighted.rounded())
        if rounded >= 0 {
            return "Contributing +\(rounded) to your score"
        } else {
            return "Pulling score down by \(abs(rounded))"
        }
    }

    private var impactIsPositive: Bool {
        Double(component.value - 50) * component.effectiveWeight >= 0
    }

    // MARK: - Body

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 10) {
                // Component name + current value
                HStack(alignment: .firstTextBaseline) {
                    Text(component.kind.label)
                        .font(KoruFont.statusWord)
                        .koruForeground(KoruColors.ink)
                    Spacer()
                    Text("\(component.value)")
                        .font(.system(size: 36, weight: .semibold, design: .rounded))
                        .koruForeground(KoruColors.ink)
                }

                // 7-day mini sparkline
                if sparklineValues.count > 1 {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("7-DAY")
                            .font(KoruFont.sectionHeader)
                            .koruForeground(KoruColors.inkDim)
                        TrendSparkline(values: sparklineValues)
                            .frame(height: 44)
                    }
                }

                // Baseline comparison
                HStack(spacing: 6) {
                    Circle()
                        .fill(baselineColor)
                        .frame(width: 8, height: 8)
                    Text(baselineComparison)
                        .font(KoruFont.body)
                        .koruForeground(KoruColors.ink)
                }

                // Score impact badge
                Text(impactText)
                    .font(KoruFont.bodyEmphasis)
                    .foregroundStyle(impactIsPositive
                        ? KoruColors.auroraTeal.resolve(theme, colorScheme: scheme)
                        : KoruColors.auroraCoral.resolve(theme, colorScheme: scheme))
                    .padding(.horizontal, 10)
                    .padding(.vertical, 6)
                    .background(
                        RoundedRectangle(cornerRadius: 8)
                            .fill((impactIsPositive
                                ? KoruColors.auroraTeal.resolve(theme, colorScheme: scheme)
                                : KoruColors.auroraCoral.resolve(theme, colorScheme: scheme))
                                .opacity(0.15))
                    )

                // Explanation text
                Text(explanation(for: component.kind))
                    .font(KoruFont.caption)
                    .koruForeground(KoruColors.inkDim)
                    .padding(.top, 4)
                    .fixedSize(horizontal: false, vertical: true)

                // Dismiss
                Button {
                    dismiss()
                } label: {
                    Text("Got it")
                        .font(KoruFont.bodyEmphasis)
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .tint(.white.opacity(0.9))
                .padding(.top, 6)
            }
            .padding(.horizontal, device.horizontalPadding)
            .padding(.vertical, 12)
        }
        .koruBackground(KoruColors.surface)
    }

    // MARK: - Helpers

    private var baselineColor: Color {
        let z = component.zScore
        if abs(z) < 0.3 {
            return KoruColors.auroraViolet.resolve(theme, colorScheme: scheme)
        } else if z > 0 {
            return KoruColors.auroraTeal.resolve(theme, colorScheme: scheme)
        } else {
            return KoruColors.auroraCoral.resolve(theme, colorScheme: scheme)
        }
    }

    private func explanation(for kind: ComponentKind) -> String {
        switch kind {
        case .hrv:
            return "Heart Rate Variability measures your autonomic nervous system's flexibility. Higher overnight SDNN means stronger recovery capacity."
        case .restingHeartRate:
            return "Resting Heart Rate reflects cardiovascular efficiency. A lower RHR generally indicates better aerobic fitness and recovery."
        case .sleep:
            return "Sleep quality combines total duration, deep + REM time, and sleep efficiency. Consistent 7-9 hours supports recovery and cognitive performance."
        case .activityRings:
            return "Activity Rings track your Move, Exercise, and Stand goals. Closing all three consistently supports long-term metabolic health."
        case .workoutLoad:
            return "Workout Load compares today's training stress against your 7-day average. Sudden spikes may indicate overtraining risk."
        case .vo2Max:
            return "VO\u{2082} Max estimates your maximum oxygen uptake. It is the single strongest predictor of cardiovascular longevity."
        case .spo2:
            return "Blood Oxygen saturation reflects respiratory efficiency. Overnight readings below 95% may warrant attention."
        case .respiratoryRate:
            return "Respiratory Rate during sleep is a sensitive early indicator of stress, illness, or overtraining. Stability near your baseline is ideal."
        case .wristTemperature:
            return "Wrist Temperature deviation from your baseline can signal immune activation, hormonal shifts, or environmental factors. Smaller deviations are better."
        case .mindfulness:
            return "Mindful minutes track intentional breathing or meditation sessions. Even 5-10 minutes daily supports parasympathetic recovery."
        }
    }
}
