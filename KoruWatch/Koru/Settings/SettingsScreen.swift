//
//  SettingsScreen.swift
//  Koru Watch App
//
//  Page 4 in the crown pager — theme, Night Mode schedule, and
//  notifications controls. No scoring-weight sliders (weights are
//  locked per product decision).
//

import SwiftUI
import KoruCore
import KoruUI

struct SettingsScreen: View {
    @EnvironmentObject private var app: AppModel
    @AppStorage("koru.notifyMorning") private var notifyMorning: Bool = true
    @AppStorage("koru.notifyRecovery") private var notifyRecovery: Bool = true
    @AppStorage("koru.nightModeEnabled") private var nightModeEnabled: Bool = true

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 10) {
                Text("SETTINGS")
                    .font(KoruFont.sectionHeader)
                    .koruForeground(KoruColors.inkDim)

                Picker("Theme", selection: Binding(
                    get: { app.manualTheme },
                    set: { app.setTheme($0) }
                )) {
                    Text("Auto").tag(KoruTheme.auto)
                    Text("Day").tag(KoruTheme.day)
                    Text("Dark").tag(KoruTheme.dark)
                    Text("Night").tag(KoruTheme.night)
                }

                Toggle("Night Mode schedule", isOn: $nightModeEnabled)
                    .font(KoruFont.body)

                Toggle("Morning summary", isOn: $notifyMorning)
                    .font(KoruFont.body)

                Toggle("Recovery alerts", isOn: $notifyRecovery)
                    .font(KoruFont.body)

                Text("Privacy")
                    .font(KoruFont.sectionHeader)
                    .koruForeground(KoruColors.inkDim)
                    .padding(.top, 8)

                Text("Koru runs 100% on your watch. No iCloud, no analytics, no network. Your HealthKit data never leaves the device.")
                    .font(KoruFont.caption)
                    .koruForeground(KoruColors.inkDim)

                Text("Koru is not a medical device. Always consult a clinician for medical concerns.")
                    .font(KoruFont.caption)
                    .koruForeground(KoruColors.inkDim)
                    .padding(.top, 6)
            }
            .padding(12)
        }
    }
}
