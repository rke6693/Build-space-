import Foundation
import Security

/// The device's identity with the relay: an id and the secret it signs with.
///
/// The secret is handed over exactly once, at pairing, and never leaves the
/// Keychain afterwards — every request carries a signature derived from it
/// rather than the secret itself. `kSecAttrAccessibleAfterFirstUnlock` is the
/// loosest class that still survives a reboot, which matters because a capture
/// queued overnight has to flush before the user next raises their wrist.
public struct Credentials: Sendable, Equatable {
    public let deviceId: String
    public let deviceSecret: String
    public let endpoint: URL

    public init(deviceId: String, deviceSecret: String, endpoint: URL) {
        self.deviceId = deviceId
        self.deviceSecret = deviceSecret
        self.endpoint = endpoint
    }
}

public enum CredentialStore {
    private static let service = "com.hermes.relay.credentials"
    private static let account = "device"

    /// Shared with the widget extension (and the phone app) through the keychain
    /// access group declared in the entitlements.
    private static var accessGroup: String? {
        Bundle.main.object(forInfoDictionaryKey: "HermesKeychainAccessGroup") as? String
    }

    public static func load() -> Credentials? {
        var query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne,
        ]
        if let accessGroup { query[kSecAttrAccessGroup as String] = accessGroup }

        var item: CFTypeRef?
        guard SecItemCopyMatching(query as CFDictionary, &item) == errSecSuccess,
              let data = item as? Data,
              let stored = try? JSONDecoder().decode(Stored.self, from: data),
              let endpoint = URL(string: stored.endpoint)
        else { return nil }

        return Credentials(deviceId: stored.deviceId, deviceSecret: stored.deviceSecret, endpoint: endpoint)
    }

    @discardableResult
    public static func save(_ credentials: Credentials) -> Bool {
        let stored = Stored(
            deviceId: credentials.deviceId,
            deviceSecret: credentials.deviceSecret,
            endpoint: credentials.endpoint.absoluteString
        )
        guard let data = try? JSONEncoder().encode(stored) else { return false }

        var query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
        ]
        if let accessGroup { query[kSecAttrAccessGroup as String] = accessGroup }

        // Delete-then-add rather than update: it is one code path for both the
        // first pairing and a re-pairing after the secret was rotated.
        SecItemDelete(query as CFDictionary)

        var insert = query
        insert[kSecValueData as String] = data
        insert[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlock
        return SecItemAdd(insert as CFDictionary, nil) == errSecSuccess
    }

    public static func clear() {
        var query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
        ]
        if let accessGroup { query[kSecAttrAccessGroup as String] = accessGroup }
        SecItemDelete(query as CFDictionary)
    }

    private struct Stored: Codable {
        let deviceId: String
        let deviceSecret: String
        let endpoint: String
    }
}
