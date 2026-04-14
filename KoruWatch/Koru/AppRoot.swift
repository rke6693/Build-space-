//
//  AppRoot.swift
//  Koru Watch App
//
//  The first real view. Decides between the onboarding flow and the
//  main pager, and hosts the check-in sheet globally so the Action
//  Button (Ultra 2) or Double Tap (Series 9) can surface it from any
//  screen without duplicating logic.
//

import SwiftUI
import KoruCore
import KoruUI

struct AppRoot: View {
    @EnvironmentObject private var app: AppModel

    var body: some View {
        Group {
            if app.isOnboarded {
                MainPager()
            } else {
                OnboardingFlow()
            }
        }
        .sheet(isPresented: $app.showingCheckIn) {
            CheckInSheet()
        }
        .koruBackground(KoruColors.surface)
        // Bridge the AppIntent → SwiftUI state. The check-in intent (invoked
        // via Action Button, Siri, the widget, or Double Tap) posts this
        // notification and we flip the sheet flag on the main actor.
        .onReceive(NotificationCenter.default.publisher(for: .koruPresentCheckIn)) { _ in
            app.showingCheckIn = true
            KoruHaptic.checkInTap.play()
        }
    }
}
