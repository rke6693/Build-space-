import Foundation
import SwiftUI
import UIKit

@MainActor
final class PairingModel: ObservableObject {
    enum State: Equatable {
        case idle
        case pairing
        case paired(deviceId: String)
        case failed(String)
    }

    @Published var endpoint: String = UserDefaults.standard.string(forKey: endpointKey) ?? ""
    @Published var code: String = ""
    @Published private(set) var state: State = .idle

    private static let endpointKey = "hermes.endpoint"

    var existing: Credentials? { CredentialStore.load() }

    func start() {
        WatchLink.shared.activate()
        // If the watch asks for credentials (fresh install, restored backup),
        // hand over whatever this phone already has.
        WatchLink.shared.onCredentialsRequested = { [weak self] in
            guard let credentials = self?.existing else { return }
            WatchLink.shared.send(credentials)
        }
        if let credentials = existing {
            state = .paired(deviceId: credentials.deviceId)
        }
    }

    func pair() async {
        let trimmedEndpoint = endpoint.trimmingCharacters(in: .whitespaces)
        guard let url = normalizedURL(trimmedEndpoint) else {
            state = .failed("Enter your relay URL, e.g. https://hermes.example.com")
            return
        }
        guard !code.trimmingCharacters(in: .whitespaces).isEmpty else {
            state = .failed("Enter the code from the Hermes web dashboard")
            return
        }

        state = .pairing
        do {
            let credentials = try await HermesAPI.pair(
                endpoint: url,
                code: code,
                deviceName: UIDevice.current.name,
                platform: "IOS",
                model: UIDevice.current.model
            )
            CredentialStore.save(credentials)
            UserDefaults.standard.set(url.absoluteString, forKey: Self.endpointKey)

            // The watch is the device that actually matters; push immediately.
            WatchLink.shared.send(credentials)

            code = ""
            state = .paired(deviceId: credentials.deviceId)
        } catch {
            state = .failed(error.localizedDescription)
        }
    }

    func resendToWatch() {
        guard let credentials = existing else { return }
        WatchLink.shared.send(credentials)
    }

    func unpair() {
        CredentialStore.clear()
        state = .idle
    }

    /// Accepts "hermes.example.com" as readily as a full URL — nobody wants to
    /// type a scheme on a phone keyboard.
    private func normalizedURL(_ raw: String) -> URL? {
        guard !raw.isEmpty else { return nil }
        let withScheme = raw.contains("://") ? raw : "https://\(raw)"
        guard let url = URL(string: withScheme), url.host != nil else { return nil }
        // Refuse plaintext: the pairing response carries the device secret.
        guard url.scheme == "https" || url.host == "localhost" else { return nil }
        return url
    }
}
