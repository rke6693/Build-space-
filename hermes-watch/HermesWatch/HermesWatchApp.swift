import SwiftUI
import WatchKit

@main
struct HermesWatchApp: App {
    @WKApplicationDelegateAdaptor private var delegate: AppDelegate
    @StateObject private var model = CaptureViewModel()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(model)
                .onAppear { delegate.model = model }
        }
    }
}

struct RootView: View {
    @EnvironmentObject private var model: CaptureViewModel

    var body: some View {
        TabView {
            CaptureView()
                .tag(0)
            InboxView()
                .tag(1)
            StatusView()
                .tag(2)
        }
        .tabViewStyle(.verticalPage)
        .onAppear(perform: consumePendingLaunch)
        .onOpenURL { url in
            // hermes://capture?source=complication — the complication launches
            // the app with this, and we go straight to listening.
            guard url.scheme == "hermes", url.host == "capture" else { return }
            let source = URLComponents(url: url, resolvingAgainstBaseURL: false)?
                .queryItems?
                .first(where: { $0.name == "source" })?
                .value
                .flatMap(CaptureSource.init(rawValue:)) ?? .complication
            model.beginCapture(source: source)
        }
    }

    /// If we were launched by the Action button (or Siri, or a complication),
    /// start listening immediately — the user already committed to speaking by
    /// pressing the button, and making them tap again would defeat the point.
    private func consumePendingLaunch() {
        guard let pending = PendingLaunchAction.take() else { return }
        model.beginCapture(source: pending.source, hint: pending.hint)
    }
}

/// Background work: drain the outbox on the system's schedule so captures made
/// out of range land without the user ever reopening the app.
final class AppDelegate: NSObject, WKApplicationDelegate {
    weak var model: CaptureViewModel?

    func applicationDidFinishLaunching() {
        scheduleBackgroundRefresh(after: 15 * 60)

        // The phone is where pairing happens; listen for the credentials it
        // sends over, and ask for them if this watch has none (fresh install,
        // or restored from a backup that did not carry the Keychain item).
        WatchLink.shared.activate()
        WatchLink.shared.onCredentialsReceived = { [weak self] _ in
            Task { @MainActor in
                self?.model?.refreshPairing()
                await self?.model?.flushQueue()
            }
        }
        if CredentialStore.load() == nil {
            WatchLink.shared.requestCredentials()
        }
    }

    func handle(_ backgroundTasks: Set<WKRefreshBackgroundTask>) {
        for task in backgroundTasks {
            switch task {
            case let refresh as WKApplicationRefreshBackgroundTask:
                Task { @MainActor in
                    await self.model?.flushQueue()
                    await self.model?.refreshInbox(force: true)
                    let depth = await CaptureQueue.shared.depth
                    // Come back sooner while there is still a backlog.
                    self.scheduleBackgroundRefresh(after: depth > 0 ? 5 * 60 : 30 * 60)
                    refresh.setTaskCompletedWithSnapshot(false)
                }
            default:
                task.setTaskCompletedWithSnapshot(false)
            }
        }
    }

    private func scheduleBackgroundRefresh(after seconds: TimeInterval) {
        WKApplication.shared().scheduleBackgroundRefresh(
            withPreferredDate: Date().addingTimeInterval(seconds),
            userInfo: nil
        ) { _ in }
    }
}
