//
//  TrendScreen.swift
//  Koru Watch App
//
//  Page 2 — 7-day sparkline with delta badge.
//

import SwiftUI
import KoruCore
import KoruUI

struct TrendScreen: View {
    @EnvironmentObject private var app: AppModel
    @Environment(\.koruDevice) private var device

    private var values: [Int] {
        let last = app.recentHistory.prefix(7).map(\.value)
        return Array(last.reversed())
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text("7-DAY TREND")
                    .font(KoruFont.sectionHeader)
                    .koruForeground(KoruColors.inkDim)
                Spacer()
                if let score = app.todayScore {
                    Text(score.trend >= 0 ? "+\(score.trend)" : "\(score.trend)")
                        .font(.system(size: 20, weight: .semibold, design: .rounded))
                        .foregroundStyle(score.trend >= 0 ? Color.hex("37E2D5") : Color.hex("FF6B6B"))
                }
            }
            if values.count > 1 {
                TrendSparkline(values: values)
                    .frame(maxHeight: .infinity)
                    .padding(.vertical, 6)
                HStack {
                    ForEach(["M","T","W","T","F","S","S"], id: \.self) { d in
                        Text(d)
                            .font(KoruFont.caption)
                            .koruForeground(KoruColors.inkDim)
                            .frame(maxWidth: .infinity)
                    }
                }
            } else {
                Spacer()
                Text("Building your trend…")
                    .font(KoruFont.caption)
                    .koruForeground(KoruColors.inkDim)
                    .frame(maxWidth: .infinity, alignment: .center)
                Spacer()
            }
        }
        .padding(.horizontal, device.horizontalPadding)
        .padding(.vertical, 10)
    }
}
