//
//  ScoreScreen.swift
//  Koru Watch App
//
//  Page 1 — the anchor. ScoreHero (ring + numeral + trend) inside a
//  safe-area padded stack. Accessibility rotor exposes every
//  component of the score for VoiceOver users. Overlays streak badge,
//  milestone celebrations, and a share card preview.
//

import SwiftUI
import KoruCore
import KoruUI

struct ScoreScreen: View {
    @EnvironmentObject private var app: AppModel
    @Environment(\.koruDevice) private var device

    @State private var showShareCard = false

    var body: some View {
        ZStack {
            VStack {
                if let score = app.todayScore {
                    ZStack(alignment: .topTrailing) {
                        VStack(spacing: 0) {
                            ScoreHero(score: score)
                                .accessibilityElement(children: .contain)
                                .accessibilityRotor("Contributors") {
                                    ForEach(score.topContributors(limit: 10)) { comp in
                                        AccessibilityRotorEntry(
                                            Text("\(comp.kind.label), \(comp.value) out of 100"),
                                            id: comp.kind
                                        )
                                    }
                                }
                                .accessibilityAction(.default) { app.presentCheckIn() }
                                .accessibilityAction(named: "Check in") { app.presentCheckIn() }

                            // Share button below the trend row
                            Button(action: { showShareCard.toggle() }) {
                                Image(systemName: "square.and.arrow.up")
                                    .font(.system(size: 13, weight: .medium))
                                    .koruForeground(KoruColors.inkDim)
                            }
                            .buttonStyle(.plain)
                            .padding(.top, 6)
                            .accessibilityLabel("Share score")
                        }

                        // Streak badge in top-right
                        if streak >= 3 {
                            StreakBadge(streak: streak)
                                .padding(.top, 2)
                        }
                    }
                } else if app.isComputing {
                    ProgressView()
                        .progressViewStyle(.circular)
                        .tint(.white)
                } else {
                    VStack(spacing: 6) {
                        SpiralLogo(lineWidth: 3)
                            .frame(width: 44, height: 44)
                        Text("No data yet")
                            .font(KoruFont.bodyEmphasis)
                            .koruForeground(KoruColors.ink)
                        Text("Wear your watch overnight to see your first score tomorrow morning.")
                            .font(KoruFont.caption)
                            .koruForeground(KoruColors.inkDim)
                            .multilineTextAlignment(.center)
                    }
                    .padding(.horizontal, device.horizontalPadding)
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)

            // Milestone celebration overlay
            if app.pendingMilestone != nil {
                MilestoneCard(
                    milestone: Binding(
                        get: { app.pendingMilestone },
                        set: { app.pendingMilestone = $0 }
                    ),
                    onDismiss: { app.dismissMilestone() }
                )
            }
        }
        .sheet(isPresented: $showShareCard) {
            if let score = app.todayScore {
                ShareCardView.render(score: score)
                    .padding(8)
            }
        }
    }

    private var streak: Int {
        StreakBadge.currentStreak(from: app.recentHistory)
    }
}

// MARK: - ScoreComponent.Identifiable for rotor

extension ScoreComponent: Identifiable {
    public var id: ComponentKind { kind }
}
