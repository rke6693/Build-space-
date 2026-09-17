import SwiftUI

/// The iPhone app exists for one job: pairing. Type the code once here, and the
/// credentials are pushed to the watch over WatchConnectivity. After that the
/// watch is independent — it talks to the relay directly over Wi-Fi or LTE and
/// never needs the phone again.
@main
struct HermesPhoneApp: App {
    @StateObject private var model = PairingModel()

    var body: some Scene {
        WindowGroup {
            PairingView()
                .environmentObject(model)
                .onAppear { model.start() }
        }
    }
}
