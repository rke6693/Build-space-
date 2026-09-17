import AppIntents
import SwiftUI
import WidgetKit

/// Complications, so capture is one tap from the watch face — which on an Ultra
/// is often faster than the Action button if your thumb is already there.
///
/// The corner and circular families carry the outbox depth, because "is it
/// actually sent?" is the only question this app ever has to answer on a face.
@main
struct HermesWidgetBundle: WidgetBundle {
    var body: some Widget {
        CaptureComplication()
    }
}

struct CaptureEntry: TimelineEntry {
    let date: Date
    let queueDepth: Int
    let paired: Bool
}

struct CaptureProvider: TimelineProvider {
    func placeholder(in context: Context) -> CaptureEntry {
        CaptureEntry(date: Date(), queueDepth: 0, paired: true)
    }

    func getSnapshot(in context: Context, completion: @escaping (CaptureEntry) -> Void) {
        Task { completion(await entry()) }
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<CaptureEntry>) -> Void) {
        Task {
            // Nothing here changes on a schedule — it changes when the app does
            // something — so refresh lazily and let the app reload the timeline.
            let timeline = Timeline(entries: [await entry()], policy: .after(Date().addingTimeInterval(15 * 60)))
            completion(timeline)
        }
    }

    private func entry() async -> CaptureEntry {
        CaptureEntry(
            date: Date(),
            queueDepth: await CaptureQueue.shared.depth,
            paired: CredentialStore.load() != nil
        )
    }
}

struct CaptureComplication: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "HermesCapture", provider: CaptureProvider()) { entry in
            CaptureComplicationView(entry: entry)
                .containerBackground(.fill.tertiary, for: .widget)
                // Tapping launches the app, which reads this URL and starts
                // listening immediately rather than showing an idle screen.
                .widgetURL(URL(string: "hermes://capture?source=complication"))
        }
        .configurationDisplayName("Hermes")
        .description("Speak to your agent.")
        .supportedFamilies([
            .accessoryCircular,
            .accessoryCorner,
            .accessoryInline,
            .accessoryRectangular,
        ])
    }
}

struct CaptureComplicationView: View {
    @Environment(\.widgetFamily) private var family
    let entry: CaptureEntry

    var body: some View {
        switch family {
        case .accessoryInline:
            Label(inlineText, systemImage: "mic.fill")

        case .accessoryRectangular:
            HStack(spacing: 8) {
                Image(systemName: "mic.fill")
                    .font(.title3)
                VStack(alignment: .leading, spacing: 2) {
                    Text("Hermes").font(.headline)
                    Text(inlineText)
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
            }
            .widgetAccentable()

        case .accessoryCorner:
            Image(systemName: "mic.fill")
                .font(.title2)
                .widgetLabel { Text(inlineText) }

        default:
            ZStack {
                AccessoryWidgetBackground()
                if entry.queueDepth > 0 {
                    VStack(spacing: 0) {
                        Image(systemName: "mic.fill").font(.caption)
                        Text("\(entry.queueDepth)").font(.caption2.weight(.semibold))
                    }
                } else {
                    Image(systemName: "mic.fill").font(.title3)
                }
            }
        }
    }

    private var inlineText: String {
        if !entry.paired { return "Pair on iPhone" }
        return entry.queueDepth > 0 ? "\(entry.queueDepth) queued" : "Speak"
    }
}
