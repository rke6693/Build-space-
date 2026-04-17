//
//  CalendarHeatMap.swift
//  Koru Watch App
//
//  Page 4 in the crown pager — a 4-week (28-day) calendar grid where
//  each cell is colored by that day's score band. Today's cell has a
//  ring highlight; days with no score are dimmed. Compact enough for
//  the smallest watch screen (41mm).
//

import SwiftUI
import KoruCore
import KoruUI

struct CalendarHeatMap: View {
    @EnvironmentObject private var app: AppModel
    @Environment(\.koruDevice) private var device
    @Environment(\.koruTheme) private var theme
    @Environment(\.colorScheme) private var scheme

    private let calendar = Calendar.current
    private let dayHeaders = ["M", "T", "W", "T", "F", "S", "S"]

    // MARK: - Date grid

    /// Build a 28-day grid ending on today's date, aligned to start on
    /// a Monday so the day-of-week headers match.
    private var gridDays: [Date] {
        let today = calendar.startOfDay(for: Date())
        // Find the Monday of the current week.
        let weekday = calendar.component(.weekday, from: today)
        // ISO: Monday=2 … Sunday=1. Shift so Mon=0.
        let daysFromMonday = (weekday + 5) % 7
        let endOfWeek = calendar.date(byAdding: .day, value: 6 - daysFromMonday, to: today)!
        // 4 full weeks ending at endOfWeek.
        let startDate = calendar.date(byAdding: .day, value: -27, to: endOfWeek)!
        return (0..<28).map { offset in
            calendar.date(byAdding: .day, value: offset, to: startDate)!
        }
    }

    /// Look up a score for a given day in recent history.
    private func score(for day: Date) -> WellnessScore? {
        app.recentHistory.first { calendar.isDate($0.day, inSameDayAs: day) }
    }

    private var monthYearLabel: String {
        let formatter = DateFormatter()
        formatter.dateFormat = "MMMM yyyy"
        return formatter.string(from: Date())
    }

    // MARK: - Body

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            // Month / year header
            Text(monthYearLabel.uppercased())
                .font(KoruFont.sectionHeader)
                .koruForeground(KoruColors.inkDim)

            // Day-of-week headers
            HStack(spacing: 0) {
                ForEach(dayHeaders.indices, id: \.self) { i in
                    Text(dayHeaders[i])
                        .font(KoruFont.caption)
                        .koruForeground(KoruColors.inkDim)
                        .frame(maxWidth: .infinity)
                }
            }

            // 4 × 7 grid
            let cellSize = cellDimension
            VStack(spacing: 3) {
                ForEach(0..<4, id: \.self) { row in
                    HStack(spacing: 3) {
                        ForEach(0..<7, id: \.self) { col in
                            let day = gridDays[row * 7 + col]
                            let dayScore = score(for: day)
                            let isToday = calendar.isDateInToday(day)
                            let isFuture = day > Date()

                            cellView(
                                day: day,
                                score: dayScore,
                                isToday: isToday,
                                isFuture: isFuture,
                                size: cellSize
                            )
                        }
                    }
                }
            }
        }
        .padding(.horizontal, device.horizontalPadding)
        .padding(.vertical, 8)
    }

    // MARK: - Cell

    private var cellDimension: CGFloat {
        // Fit 7 cells + 6 gaps of 3pt + side padding within screen width.
        let available = device.screenWidth - device.horizontalPadding * 2
        return max(10, (available - 18) / 7) // 6 gaps × 3pt = 18
    }

    @ViewBuilder
    private func cellView(day: Date, score: WellnessScore?, isToday: Bool, isFuture: Bool, size: CGFloat) -> some View {
        let dayNumber = calendar.component(.day, from: day)
        ZStack {
            if isFuture {
                RoundedRectangle(cornerRadius: 4)
                    .fill(KoruColors.surface2.resolve(theme, colorScheme: scheme).opacity(0.3))
                    .frame(width: size, height: size)
            } else if let s = score {
                RoundedRectangle(cornerRadius: 4)
                    .fill(bandColor(s.band))
                    .frame(width: size, height: size)
            } else {
                RoundedRectangle(cornerRadius: 4)
                    .fill(KoruColors.surface2.resolve(theme, colorScheme: scheme).opacity(0.5))
                    .frame(width: size, height: size)
            }

            // Day number
            Text("\(dayNumber)")
                .font(.system(size: max(8, size * 0.42), weight: .medium, design: .rounded))
                .foregroundStyle(cellTextColor(score: score, isFuture: isFuture))

            // Today ring highlight
            if isToday {
                RoundedRectangle(cornerRadius: 4)
                    .strokeBorder(KoruColors.ink.resolve(theme, colorScheme: scheme), lineWidth: 2)
                    .frame(width: size, height: size)
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(accessibilityLabel(for: day, score: score))
    }

    // MARK: - Colors

    private func bandColor(_ band: ScoreBand) -> Color {
        switch band {
        case .recover: return KoruColors.auroraCoral.resolve(theme, colorScheme: scheme)
        case .steady:  return KoruColors.auroraViolet.resolve(theme, colorScheme: scheme)
        case .strong:  return KoruColors.auroraTeal.resolve(theme, colorScheme: scheme)
        case .peak:    return KoruColors.auroraTeal.resolve(theme, colorScheme: scheme).opacity(1.0)
        }
    }

    private func cellTextColor(score: WellnessScore?, isFuture: Bool) -> Color {
        if isFuture {
            return KoruColors.inkDim.resolve(theme, colorScheme: scheme).opacity(0.4)
        }
        if score != nil {
            return .white
        }
        return KoruColors.inkDim.resolve(theme, colorScheme: scheme).opacity(0.6)
    }

    // MARK: - Accessibility

    private func accessibilityLabel(for day: Date, score: WellnessScore?) -> String {
        let formatter = DateFormatter()
        formatter.dateFormat = "EEEE MMMM d"
        let dateStr = formatter.string(from: day)
        if let s = score {
            return "\(dateStr), score \(s.value), \(s.band.statusWord)"
        }
        return "\(dateStr), no score"
    }
}
