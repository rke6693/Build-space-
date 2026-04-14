//
//  ScoreWidget.swift
//  KoruWidgets
//
//  Smart Stack-ready widget showing today's Koru score. Supports
//  accessoryCircular, accessoryRectangular, and accessoryCorner
//  watchOS families so it can be placed on any face plus the
//  Smart Stack.
//

import WidgetKit
import SwiftUI
import KoruCore
import KoruUI
import KoruWidgetsKit
import KoruHealth

struct ScoreWidget: Widget {
    let kind: String = "KoruScoreWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: ScoreProvider()) { entry in
            ScoreWidgetView(entry: entry)
        }
        .configurationDisplayName("Koru Score")
        .description("Today's wellness score and trend.")
        .supportedFamilies([
            .accessoryCircular,
            .accessoryRectangular,
            .accessoryCorner,
        ])
    }
}

// MARK: - Provider

struct ScoreProvider: TimelineProvider {
    func placeholder(in context: Context) -> KoruWidgetEntry {
        KoruWidgetEntry(
            date: .now,
            score: SampleScores.placeholder,
            relevance: KoruWidgetRelevance.relevance(for: .now)
        )
    }

    func getSnapshot(in context: Context, completion: @escaping (KoruWidgetEntry) -> Void) {
        Task {
            let entry = await makeEntry(for: .now)
            completion(entry)
        }
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<KoruWidgetEntry>) -> Void) {
        Task {
            let now = Date()
            let cal = Calendar.current
            let hours = [6, 12, 18, 22]
            let startOfDay = cal.startOfDay(for: now)
            var entries: [KoruWidgetEntry] = []
            for h in hours {
                if let date = cal.date(byAdding: .hour, value: h, to: startOfDay), date >= now {
                    entries.append(await makeEntry(for: date))
                }
            }
            if entries.isEmpty {
                entries.append(await makeEntry(for: now))
            }
            // Next timeline boundary: tomorrow 06:00
            let nextRefresh = cal.date(byAdding: .day, value: 1, to: cal.date(bySettingHour: 6, minute: 0, second: 0, of: now) ?? now) ?? now.addingTimeInterval(3600 * 6)
            completion(Timeline(entries: entries, policy: .after(nextRefresh)))
        }
    }

    private func makeEntry(for date: Date) async -> KoruWidgetEntry {
        let history = ScoreHistoryStore()
        let stored = await history.loadHistory()
        let today = stored.first { Calendar.current.isDate($0.day, inSameDayAs: date) }
        return KoruWidgetEntry(
            date: date,
            score: today,
            fallbackReason: today == nil ? "Open Koru to finish setup" : nil,
            relevance: KoruWidgetRelevance.relevance(for: date)
        )
    }
}

// MARK: - View

struct ScoreWidgetView: View {
    var entry: KoruWidgetEntry
    @Environment(\.widgetFamily) var family

    var body: some View {
        switch family {
        case .accessoryCircular:    CircularContent(entry: entry)
        case .accessoryRectangular: RectangularContent(entry: entry)
        case .accessoryCorner:      CornerContent(entry: entry)
        default:                    RectangularContent(entry: entry)
        }
    }
}

private struct CircularContent: View {
    let entry: KoruWidgetEntry
    var body: some View {
        ZStack {
            AccessoryWidgetBackground()
            if let score = entry.score {
                VStack(spacing: -2) {
                    Text("\(score.value)")
                        .font(.system(size: 22, weight: .semibold, design: .rounded))
                        .monospacedDigit()
                    Text(score.band.statusWord)
                        .font(.system(size: 9, weight: .semibold))
                        .foregroundStyle(.secondary)
                }
            } else {
                Image(systemName: "sparkles")
            }
        }
    }
}

private struct RectangularContent: View {
    let entry: KoruWidgetEntry
    var body: some View {
        if let score = entry.score {
            VStack(alignment: .leading, spacing: 2) {
                HStack(alignment: .firstTextBaseline) {
                    Text("Koru")
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundStyle(.secondary)
                    Spacer()
                    Text(score.trend >= 0 ? "+\(score.trend)" : "\(score.trend)")
                        .font(.system(size: 11, weight: .semibold, design: .rounded))
                        .monospacedDigit()
                }
                HStack(alignment: .firstTextBaseline, spacing: 6) {
                    Text("\(score.value)")
                        .font(.system(size: 28, weight: .bold, design: .rounded))
                        .monospacedDigit()
                    Text(score.band.statusWord)
                        .font(.system(size: 12, weight: .semibold))
                }
                if let top = score.topContributors(limit: 1).first {
                    Text("\(top.kind.label) · \(top.subtitle)")
                        .font(.system(size: 10))
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                        .minimumScaleFactor(0.7)
                }
            }
            .padding(.horizontal, 2)
        } else {
            Text(entry.fallbackReason ?? "Open Koru")
                .font(.system(size: 11))
        }
    }
}

private struct CornerContent: View {
    let entry: KoruWidgetEntry
    var body: some View {
        if let score = entry.score {
            Text("\(score.value)")
                .font(.system(size: 18, weight: .semibold, design: .rounded))
                .monospacedDigit()
                .widgetLabel(score.band.statusWord)
        } else {
            Image(systemName: "sparkles")
                .widgetLabel("Koru")
        }
    }
}

// MARK: - Sample for placeholder

enum SampleScores {
    static let placeholder = WellnessScore(
        day: .now,
        value: 82,
        band: .strong,
        trend: 4,
        components: [],
        confidence: 0.9,
        computedAt: .now
    )
}
