import SwiftUI

/// Everything the user might need to diagnose "did that actually send?",
/// and nothing else.
struct StatusView: View {
    @EnvironmentObject private var model: CaptureViewModel
    @State private var flushing = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                row(
                    icon: model.isPaired ? "checkmark.seal.fill" : "exclamationmark.triangle.fill",
                    tint: model.isPaired ? .green : .orange,
                    title: model.isPaired ? "Paired" : "Not paired",
                    subtitle: model.isPaired
                        ? (model.credentials?.endpoint.host() ?? "relay")
                        : "Open Hermes on iPhone"
                )

                row(
                    icon: model.queueDepth > 0 ? "tray.full.fill" : "tray",
                    tint: model.queueDepth > 0 ? .orange : .secondary,
                    title: model.queueDepth > 0 ? "\(model.queueDepth) waiting" : "Outbox empty",
                    subtitle: model.queueDepth > 0 ? "Retries automatically" : "Everything delivered"
                )

                if model.queueDepth > 0 {
                    Button {
                        flushing = true
                        Task {
                            await model.flushQueue()
                            flushing = false
                        }
                    } label: {
                        if flushing {
                            ProgressView().controlSize(.mini)
                        } else {
                            Label("Send now", systemImage: "arrow.up.circle.fill")
                        }
                    }
                    .disabled(flushing)
                }

                VStack(alignment: .leading, spacing: 6) {
                    Text("Action button")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    Text("Settings → Action Button → Shortcut → Capture for Hermes")
                        .font(.caption2)
                        .foregroundStyle(.tertiary)
                }
                .padding(.top, 4)
            }
            .padding(.horizontal, 4)
        }
        .navigationTitle("Status")
        .task { await model.refreshQueueDepth() }
    }

    private func row(icon: String, tint: Color, title: String, subtitle: String) -> some View {
        HStack(spacing: 10) {
            Image(systemName: icon)
                .foregroundStyle(tint)
                .frame(width: 22)
            VStack(alignment: .leading, spacing: 2) {
                Text(title).font(.footnote.weight(.medium))
                Text(subtitle)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .lineLimit(2)
            }
            Spacer(minLength: 0)
        }
    }
}
