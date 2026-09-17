import SwiftUI

/// Replies coming back from the agent. Kept intentionally plain: this is for
/// glancing at a confirmation, not for having a conversation on a watch.
struct InboxView: View {
    @EnvironmentObject private var model: CaptureViewModel

    var body: some View {
        ScrollView {
            if model.unread.isEmpty {
                VStack(spacing: 8) {
                    Image(systemName: "tray")
                        .font(.system(size: 28))
                        .foregroundStyle(.tertiary)
                    Text("No replies")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
                .padding(.top, 40)
            } else {
                LazyVStack(alignment: .leading, spacing: 10) {
                    ForEach(model.unread) { message in
                        VStack(alignment: .leading, spacing: 4) {
                            Text(message.body)
                                .font(.footnote)
                                .lineLimit(6)
                            Text(message.createdAt.formatted(.relative(presentation: .named)))
                                .font(.caption2)
                                .foregroundStyle(.tertiary)
                        }
                        .padding(10)
                        .background(Color.white.opacity(message.read ? 0.04 : 0.1))
                        .clipShape(RoundedRectangle(cornerRadius: 12))
                    }
                }
                .padding(.horizontal, 4)
            }
        }
        .navigationTitle("Replies")
        .task { await model.refreshInbox() }
        .onDisappear {
            // Seen on the wrist counts as read.
            let seen = model.unread.filter { !$0.read }
            Task { await model.markRead(seen) }
        }
    }
}
