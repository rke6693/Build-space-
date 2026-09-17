import Foundation
import WatchConnectivity
import os

/// Carries credentials from the phone (where pairing happens, because typing an
/// 8-character code on a watch is miserable) to the watch (where they are used).
///
/// Uses `transferUserInfo`, which queues and delivers even if the counterpart
/// app is not running — so you can pair on the phone with the watch on the
/// charger in another room and it still arrives.
public final class WatchLink: NSObject, WCSessionDelegate {
    public static let shared = WatchLink()

    private let logger = Logger(subsystem: "com.hermes.relay", category: "link")

    /// Called on the watch when credentials arrive from the phone.
    public var onCredentialsReceived: ((Credentials) -> Void)?
    /// Called on the phone when the watch asks to be re-provisioned.
    public var onCredentialsRequested: (() -> Void)?

    private enum Key {
        static let kind = "kind"
        static let deviceId = "deviceId"
        static let deviceSecret = "deviceSecret"
        static let endpoint = "endpoint"
    }

    private enum Kind {
        static let credentials = "credentials"
        static let request = "credentials-request"
    }

    public func activate() {
        guard WCSession.isSupported() else { return }
        let session = WCSession.default
        session.delegate = self
        session.activate()
    }

    /// Phone → watch.
    public func send(_ credentials: Credentials) {
        guard WCSession.isSupported() else { return }
        WCSession.default.transferUserInfo([
            Key.kind: Kind.credentials,
            Key.deviceId: credentials.deviceId,
            Key.deviceSecret: credentials.deviceSecret,
            Key.endpoint: credentials.endpoint.absoluteString,
        ])
    }

    /// Watch → phone: "I have no credentials, send them if you have them."
    public func requestCredentials() {
        guard WCSession.isSupported() else { return }
        WCSession.default.transferUserInfo([Key.kind: Kind.request])
    }

    // MARK: - WCSessionDelegate

    public func session(
        _ session: WCSession,
        activationDidCompleteWith activationState: WCSessionActivationState,
        error: Error?
    ) {
        if let error {
            logger.error("WCSession activation failed: \(error.localizedDescription, privacy: .public)")
        }
    }

    public func session(_ session: WCSession, didReceiveUserInfo userInfo: [String: Any] = [:]) {
        switch userInfo[Key.kind] as? String {
        case Kind.credentials:
            guard let deviceId = userInfo[Key.deviceId] as? String,
                  let deviceSecret = userInfo[Key.deviceSecret] as? String,
                  let endpointString = userInfo[Key.endpoint] as? String,
                  let endpoint = URL(string: endpointString)
            else { return }

            let credentials = Credentials(deviceId: deviceId, deviceSecret: deviceSecret, endpoint: endpoint)
            CredentialStore.save(credentials)
            DispatchQueue.main.async { self.onCredentialsReceived?(credentials) }

        case Kind.request:
            DispatchQueue.main.async { self.onCredentialsRequested?() }

        default:
            break
        }
    }

    #if os(iOS)
    public func sessionDidBecomeInactive(_ session: WCSession) {}

    public func sessionDidDeactivate(_ session: WCSession) {
        // Re-activate so a switched watch keeps working.
        WCSession.default.activate()
    }
    #endif
}
