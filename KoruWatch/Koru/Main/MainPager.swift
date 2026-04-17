//
//  MainPager.swift
//  Koru Watch App
//
//  Five vertically-paged screens: score → trend → insights → calendar
//  → settings. Driven by crown rotation (the default TabView
//  .verticalPage style on watchOS 11) so there's zero custom gesture
//  code.
//

import SwiftUI
import KoruCore
import KoruUI

struct MainPager: View {
    @EnvironmentObject private var app: AppModel
    @State private var page: Int = 0

    var body: some View {
        TabView(selection: $page) {
            ScoreScreen().tag(0)
            TrendScreen().tag(1)
            InsightsScreen().tag(2)
            CalendarHeatMap().tag(3)
            SettingsScreen().tag(4)
        }
        .tabViewStyle(.verticalPage)
        .koruBackground(KoruColors.surface)
        .onChange(of: page) { _, _ in
            KoruHaptic.pageTurn.play()
        }
        .toolbar {
            // On Series 9 / watches without an Action Button, show an
            // explicit check-in button in the top bar.
            if !KoruDeviceClass.current().hasActionButton {
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        app.presentCheckIn()
                    } label: {
                        Image(systemName: "checkmark.circle.fill")
                    }
                    .accessibilityLabel("Check in")
                }
            }
        }
    }
}
