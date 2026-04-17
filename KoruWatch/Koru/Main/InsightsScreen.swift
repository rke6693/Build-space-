//
//  InsightsScreen.swift
//  Koru Watch App
//
//  Page 3 — top 3 contributing components + a personalized insight
//  phrase from InsightEngine. Keeps the user oriented: "what moved
//  today's score, and what do I do about it?" Tapping a contributor
//  row opens ComponentDetailView as a sheet.
//

import SwiftUI
import KoruCore
import KoruUI

struct InsightsScreen: View {
    @EnvironmentObject private var app: AppModel
    @Environment(\.koruDevice) private var device

    @State private var selectedComponent: ScoreComponent?

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("CONTRIBUTORS")
                .font(KoruFont.sectionHeader)
                .koruForeground(KoruColors.inkDim)

            if let score = app.todayScore {
                ForEach(score.topContributors(limit: 3)) { c in
                    Button {
                        selectedComponent = c
                    } label: {
                        ContributorRow(component: c)
                    }
                    .buttonStyle(.plain)
                }
                Spacer(minLength: 4)
                Text(insightText(for: score))
                    .font(KoruFont.caption)
                    .koruForeground(KoruColors.ink)
                    .padding(8)
                    .background(KoruColors.surface2.resolve(.auto, colorScheme: .dark))
                    .clipShape(RoundedRectangle(cornerRadius: 10))
            } else {
                Spacer()
                Text("No insights yet.")
                    .font(KoruFont.caption)
                    .koruForeground(KoruColors.inkDim)
                Spacer()
            }
        }
        .padding(.horizontal, device.horizontalPadding)
        .padding(.vertical, 10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .sheet(item: $selectedComponent) { component in
            ComponentDetailView(
                component: component,
                history: app.recentHistory
            )
        }
    }

    private func insightText(for score: WellnessScore) -> String {
        // Use InsightEngine for personalized insights when enough history exists.
        let insights = InsightEngine.analyze(history: app.recentHistory)
        if let top = insights.first {
            return top.text
        }
        // Fallback to band-based canned text when history is insufficient.
        return fallbackInsightText(for: score)
    }

    private func fallbackInsightText(for score: WellnessScore) -> String {
        switch score.band {
        case .peak:    return "All systems green. Try a benchmark workout today."
        case .strong:  return "Green-light for an intensity day. Don't forget sunlight."
        case .steady:  return "Good enough to train, but dial back intensity. Keep it zone 2."
        case .recover: return "Your body's working on something. Hydrate, sunlight, easy walk only."
        }
    }
}
