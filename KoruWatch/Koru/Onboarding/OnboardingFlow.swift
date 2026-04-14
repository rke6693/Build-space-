//
//  OnboardingFlow.swift
//  Koru Watch App
//
//  3-page permission onboarding: Vitals → Activity → Sleep. Each page
//  explains what data is read and why, then requests authorization
//  for a coherent group of HealthKit types in one sheet.
//

import SwiftUI
import KoruCore
import KoruHealth
import KoruUI

struct OnboardingFlow: View {
    @EnvironmentObject private var app: AppModel
    @State private var page: Int = 0

    var body: some View {
        TabView(selection: $page) {
            WelcomePage(onContinue: { page = 1 })
                .tag(0)
            PermissionPage(
                group: .vitals,
                title: "Vitals",
                subtitle: "HRV, resting heart rate, SpO₂, respiratory rate, wrist temperature.",
                why: "Koru blends these five signals for the physiological half of your score.",
                onContinue: { page = 2 }
            )
            .tag(1)
            PermissionPage(
                group: .activity,
                title: "Activity",
                subtitle: "Move, Exercise, Stand rings, workouts, VO₂ max.",
                why: "Your daily behavior and training load complete the fitness side of your score.",
                onContinue: { page = 3 }
            )
            .tag(2)
            PermissionPage(
                group: .sleep,
                title: "Sleep & Breath",
                subtitle: "Sleep stages, mindful minutes.",
                why: "Recovery is half the story. Koru reads sleep quality and any mindfulness sessions you log.",
                onContinue: { app.isOnboarded = true; Task { await app.computeToday() } }
            )
            .tag(3)
        }
        .tabViewStyle(.page)
        .koruBackground(KoruColors.surface)
    }
}

private struct WelcomePage: View {
    let onContinue: () -> Void
    var body: some View {
        VStack(spacing: 14) {
            SpiralLogo(lineWidth: 6)
                .frame(width: 72, height: 72)
            Text("Koru")
                .font(.system(size: 32, weight: .semibold, design: .rounded))
                .koruForeground(KoruColors.ink)
            Text("Your wellness, distilled into one private daily number.")
                .font(KoruFont.body)
                .koruForeground(KoruColors.inkDim)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 12)
            Spacer(minLength: 4)
            Button(action: onContinue) {
                Text("Begin")
                    .font(KoruFont.bodyEmphasis)
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .tint(.white.opacity(0.9))
        }
        .padding(16)
    }
}

private struct PermissionPage: View {
    let group: HealthAuthorizationGroup
    let title: String
    let subtitle: String
    let why: String
    let onContinue: () -> Void

    @EnvironmentObject private var app: AppModel
    @State private var requested: Bool = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 10) {
                Text(title)
                    .font(.system(size: 22, weight: .semibold, design: .rounded))
                    .koruForeground(KoruColors.ink)
                Text(subtitle)
                    .font(KoruFont.body)
                    .koruForeground(KoruColors.ink)
                Text(why)
                    .font(KoruFont.caption)
                    .koruForeground(KoruColors.inkDim)
                    .padding(.top, 4)

                Button {
                    Task {
                        try? await app.healthStore.requestAuthorization(group: group)
                        requested = true
                        onContinue()
                    }
                } label: {
                    Text(requested ? "Continue" : "Allow \(title)")
                        .font(KoruFont.bodyEmphasis)
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .tint(.white.opacity(0.92))
                .padding(.top, 8)
            }
            .padding(14)
        }
    }
}
