//
//  InsightsScreen.swift
//  Koru Watch App
//
//  Page 3 — top 3 contributing components + a single actionable
//  insight phrase. Keeps the user oriented: "what moved today's
//  score, and what do I do about it?"
//

import SwiftUI
import KoruCore
import KoruUI

struct InsightsScreen: View {
    @EnvironmentObject private var app: AppModel
    @Environment(\.koruDevice) private var device

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("CONTRIBUTORS")
                .font(KoruFont.sectionHeader)
                .koruForeground(KoruColors.inkDim)

            if let score = app.todayScore {
                ForEach(score.topContributors(limit: 3)) { c in
                    ContributorRow(component: c)
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
    }

    private func insightText(for score: WellnessScore) -> String {
        switch score.band {
        case .peak:    return "All systems green. Try a benchmark workout today."
        case .strong:  return "Green-light for an intensity day. Don't forget sunlight."
        case .steady:  return "Good enough to train, but dial back intensity. Keep it zone 2."
        case .recover: return "Your body's working on something. Hydrate, sunlight, easy walk only."
        }
    }
}
