//
//  CheckInSheet.swift
//  Koru Watch App
//
//  5-second mood / energy / stress check-in triggered by the Ultra 2
//  Action Button, the Series 9 Double Tap, the crown long-press, or
//  the on-screen toolbar button. Three one-tap pages, then save.
//

import SwiftUI
import KoruCore
import KoruUI

struct CheckInSheet: View {
    @EnvironmentObject private var app: AppModel
    @Environment(\.dismiss) private var dismiss
    @State private var tab: Int = 0
    @State private var mood: Int = 2
    @State private var energy: Int = 2
    @State private var stress: Int = 2

    var body: some View {
        TabView(selection: $tab) {
            ChipPage(title: "Mood",   options: ["Rough","Low","OK","Good","Great"], selection: $mood)  { tab = 1 }.tag(0)
            ChipPage(title: "Energy", options: ["Drained","Low","Steady","Lively","Peak"], selection: $energy) { tab = 2 }.tag(1)
            ChipPage(title: "Stress", options: ["Calm","Soft","Wired","Tense","Fried"], selection: $stress) {
                Task { await app.logCheckIn() }
            }.tag(2)
        }
        .tabViewStyle(.page)
        .koruBackground(KoruColors.surface)
    }
}

private struct ChipPage: View {
    let title: String
    let options: [String]
    @Binding var selection: Int
    let onNext: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title.uppercased())
                .font(KoruFont.sectionHeader)
                .koruForeground(KoruColors.inkDim)
            VStack(spacing: 4) {
                ForEach(options.indices, id: \.self) { i in
                    Button {
                        selection = i
                        KoruHaptic.checkInTap.play()
                        onNext()
                    } label: {
                        HStack {
                            Text(options[i])
                                .font(KoruFont.bodyEmphasis)
                            Spacer()
                            if selection == i {
                                Image(systemName: "checkmark.circle.fill")
                            }
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 8)
                    }
                    .buttonStyle(.bordered)
                    .tint(.white.opacity(0.85))
                }
            }
        }
        .padding(10)
    }
}
