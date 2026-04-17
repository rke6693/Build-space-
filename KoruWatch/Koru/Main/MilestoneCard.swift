//
//  MilestoneCard.swift
//  Koru Watch App
//
//  Full-screen overlay that celebrates a newly achieved milestone.
//  Spring-scales in with confetti-like particles, dismisses with a
//  haptic tap. Designed for the tiny watch display — punchy and brief.
//

import SwiftUI
import KoruCore
import KoruUI

struct MilestoneCard: View {
    @Binding var milestone: Milestone?
    var onDismiss: () -> Void = {}

    @Environment(\.koruTheme) private var theme
    @Environment(\.colorScheme) private var scheme
    @State private var presented = false
    @State private var particlesVisible = false

    var body: some View {
        if let ms = milestone {
            ZStack {
                // Semi-transparent backdrop
                Color.black.opacity(0.7)
                    .ignoresSafeArea()
                    .onTapGesture { dismiss() }

                ZStack {
                    // Confetti particles
                    ConfettiParticles(visible: particlesVisible, theme: theme, scheme: scheme)

                    // Card content
                    VStack(spacing: 10) {
                        Text(ms.emoji)
                            .font(.system(size: 40))

                        Text(ms.text)
                            .font(KoruFont.bodyEmphasis)
                            .koruForeground(KoruColors.ink)
                            .multilineTextAlignment(.center)
                            .fixedSize(horizontal: false, vertical: true)

                        Button(action: { dismiss() }) {
                            Text("Celebrate")
                                .font(KoruFont.bodyEmphasis)
                                .foregroundStyle(.white)
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 8)
                                .background(
                                    Capsule()
                                        .fill(AuroraGradient.linear(
                                            theme: theme,
                                            colorScheme: scheme
                                        ))
                                )
                        }
                        .buttonStyle(.plain)
                        .padding(.top, 4)
                    }
                    .padding(.horizontal, 16)
                    .padding(.vertical, 14)
                    .background(
                        RoundedRectangle(cornerRadius: 16)
                            .fill(KoruColors.surface2.resolve(theme, colorScheme: scheme))
                    )
                    .padding(.horizontal, 12)
                }
                .scaleEffect(presented ? 1 : 0.6)
                .opacity(presented ? 1 : 0)
            }
            .onAppear {
                withAnimation(.spring(response: 0.5, dampingFraction: 0.7)) {
                    presented = true
                }
                withAnimation(.easeOut(duration: 0.8).delay(0.2)) {
                    particlesVisible = true
                }
            }
            .accessibilityElement(children: .contain)
            .accessibilityLabel("Milestone achieved: \(ms.text)")
            .accessibilityAction(.default) { dismiss() }
        }
    }

    private func dismiss() {
        KoruHaptic.success.play()
        withAnimation(.easeIn(duration: 0.2)) {
            presented = false
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.25) {
            onDismiss()
            milestone = nil
        }
    }
}

// MARK: - Confetti particles

/// 10 small circles that animate outward from center then fade.
private struct ConfettiParticles: View {
    let visible: Bool
    let theme: KoruTheme
    let scheme: ColorScheme

    private let particles = (0..<10).map { i in
        ParticleData(
            angle: Angle.degrees(Double(i) * 36),
            distance: CGFloat.random(in: 50...80),
            size: CGFloat.random(in: 4...7),
            colorIndex: i % 3
        )
    }

    var body: some View {
        ZStack {
            ForEach(0..<particles.count, id: \.self) { i in
                let p = particles[i]
                Circle()
                    .fill(particleColor(index: p.colorIndex))
                    .frame(width: p.size, height: p.size)
                    .offset(
                        x: visible ? cos(p.angle.radians) * p.distance : 0,
                        y: visible ? sin(p.angle.radians) * p.distance : 0
                    )
                    .opacity(visible ? 0 : 1)
                    .animation(
                        .easeOut(duration: 0.9).delay(Double(i) * 0.04),
                        value: visible
                    )
            }
        }
    }

    private func particleColor(index: Int) -> Color {
        switch index {
        case 0: return KoruColors.auroraTeal.resolve(theme, colorScheme: scheme)
        case 1: return KoruColors.auroraViolet.resolve(theme, colorScheme: scheme)
        default: return KoruColors.auroraCoral.resolve(theme, colorScheme: scheme)
        }
    }
}

private struct ParticleData {
    let angle: Angle
    let distance: CGFloat
    let size: CGFloat
    let colorIndex: Int
}
