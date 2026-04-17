//
//  StreakBadge.swift
//  Koru Watch App
//
//  Small badge shown in the top-right of ScoreScreen when the user has
//  a streak of 3+ consecutive days with scores. The flame icon gains
//  an aurora gradient at 7+ days.
//

import SwiftUI
import KoruCore
import KoruUI

struct StreakBadge: View {
    let streak: Int

    @Environment(\.koruTheme) private var theme
    @Environment(\.colorScheme) private var scheme
    @State private var appeared = false

    var body: some View {
        HStack(spacing: 3) {
            Image(systemName: "flame.fill")
                .font(.system(size: 14, weight: .bold))
                .foregroundStyle(flameStyle)
            Text("\(streak)")
                .font(KoruFont.bodyEmphasis)
                .koruForeground(KoruColors.ink)
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 4)
        .background(
            Capsule()
                .fill(KoruColors.surface2.resolve(theme, colorScheme: scheme).opacity(0.8))
        )
        .scaleEffect(appeared ? 1 : 0.5)
        .opacity(appeared ? 1 : 0)
        .onAppear {
            withAnimation(.spring(response: 0.5, dampingFraction: 0.65)) {
                appeared = true
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(streak) day streak")
    }

    @ViewBuilder
    private var flameStyle: some ShapeStyle {
        if streak >= 7 {
            AnyShapeStyle(AuroraGradient.linear(theme: theme, colorScheme: scheme))
        } else {
            AnyShapeStyle(Color.orange)
        }
    }

    // MARK: - Static streak calculator

    /// Count consecutive calendar days with scores, working backwards
    /// from today.
    static func currentStreak(from history: [WellnessScore]) -> Int {
        let calendar = Calendar.current
        let today = calendar.startOfDay(for: Date())
        let sorted = history.sorted { $0.day > $1.day }

        // The most recent score must be today or yesterday for a live streak.
        guard let first = sorted.first else { return 0 }
        let firstDay = calendar.startOfDay(for: first.day)
        guard calendar.isDate(firstDay, inSameDayAs: today)
            || calendar.isDate(firstDay, inSameDayAs: calendar.date(byAdding: .day, value: -1, to: today)!)
        else { return 0 }

        var count = 1
        var previousDay = firstDay
        for score in sorted.dropFirst() {
            let day = calendar.startOfDay(for: score.day)
            let expected = calendar.date(byAdding: .day, value: -1, to: previousDay)!
            if calendar.isDate(day, inSameDayAs: expected) {
                count += 1
                previousDay = day
            } else {
                break
            }
        }
        return count
    }
}
