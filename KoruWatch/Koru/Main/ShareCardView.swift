//
//  ShareCardView.swift
//  Koru Watch App
//
//  Generates a shareable image of today's score for social sharing.
//  Always renders in dark theme for maximum visual impact. On watchOS
//  this is primarily used as a screenshot-friendly preview card in the
//  weekly summary and when the user force-presses the score screen.
//

import SwiftUI
import KoruCore
import KoruUI

struct ShareCardView: View {
    let score: WellnessScore

    private let cardWidth: CGFloat = 300
    private let cardHeight: CGFloat = 380

    var body: some View {
        VStack(spacing: 0) {
            // Koru spiral logo
            SpiralLogo(lineWidth: 3)
                .frame(width: 32, height: 32)
                .padding(.top, 20)

            // Date
            Text(dateString)
                .font(KoruFont.caption)
                .foregroundStyle(Color.hex("8C94A3"))
                .padding(.top, 6)

            // Large score numeral with aurora gradient
            Text("\(score.value)")
                .font(KoruFont.scoreNumeral(size: 72))
                .monospacedDigit()
                .kerning(-2)
                .foregroundStyle(
                    LinearGradient(
                        colors: [
                            Color.hex("37E2D5"),
                            Color.hex("7B5CFF"),
                            Color.hex("FF6B6B")
                        ],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                )
                .padding(.top, 4)

            // Band status word
            Text(score.statusWord)
                .font(KoruFont.statusWord)
                .foregroundStyle(Color.hex("F4F6F8"))
                .padding(.top, 2)

            // Top 3 contributors as compact bars
            VStack(spacing: 6) {
                ForEach(score.topContributors(limit: 3), id: \.kind) { comp in
                    ShareContributorBar(component: comp)
                }
            }
            .padding(.horizontal, 24)
            .padding(.top, 16)

            Spacer(minLength: 12)

            // Footer
            Text("Tracked with Koru")
                .font(KoruFont.caption)
                .foregroundStyle(Color.hex("5C6370"))
                .padding(.bottom, 16)
        }
        .frame(width: cardWidth, height: cardHeight)
        .background(Color.black)
        .clipShape(RoundedRectangle(cornerRadius: 20))
    }

    private var dateString: String {
        let formatter = DateFormatter()
        formatter.dateFormat = "EEEE, MMM d"
        return formatter.string(from: score.day)
    }

    // MARK: - Render helper

    /// Returns a share card view at 300x380 points, ready for
    /// `ImageRenderer` on iOS 16+ or screenshot capture on watchOS.
    @ViewBuilder
    static func render(score: WellnessScore) -> some View {
        ShareCardView(score: score)
            .environment(\.colorScheme, .dark)
    }
}

// MARK: - Compact contributor bar for the share card

private struct ShareContributorBar: View {
    let component: ScoreComponent

    var body: some View {
        HStack(spacing: 8) {
            Text(component.kind.compactLabel)
                .font(KoruFont.caption)
                .foregroundStyle(Color.hex("8C94A3"))
                .frame(width: 36, alignment: .leading)

            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    RoundedRectangle(cornerRadius: 2)
                        .fill(Color.white.opacity(0.08))
                        .frame(height: 4)
                    RoundedRectangle(cornerRadius: 2)
                        .fill(
                            LinearGradient(
                                colors: [
                                    Color.hex("37E2D5"),
                                    Color.hex("7B5CFF"),
                                    Color.hex("FF6B6B")
                                ],
                                startPoint: .leading,
                                endPoint: .trailing
                            )
                        )
                        .frame(
                            width: geo.size.width * CGFloat(component.value) / 100,
                            height: 4
                        )
                }
            }
            .frame(height: 4)

            Text("\(component.value)")
                .font(KoruFont.caption)
                .monospacedDigit()
                .foregroundStyle(Color.hex("F4F6F8"))
                .frame(width: 24, alignment: .trailing)
        }
    }
}
