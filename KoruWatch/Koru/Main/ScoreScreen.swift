//
//  ScoreScreen.swift
//  Koru Watch App
//
//  Page 1 — the anchor. ScoreHero (ring + numeral + trend) inside a
//  safe-area padded stack. Accessibility rotor exposes every
//  component of the score for VoiceOver users.
//

import SwiftUI
import KoruCore
import KoruUI

struct ScoreScreen: View {
    @EnvironmentObject private var app: AppModel
    @Environment(\.koruDevice) private var device

    var body: some View {
        VStack {
            if let score = app.todayScore {
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
    }
}

// MARK: - ScoreComponent.Identifiable for rotor

extension ScoreComponent: Identifiable {
    public var id: ComponentKind { kind }
}
