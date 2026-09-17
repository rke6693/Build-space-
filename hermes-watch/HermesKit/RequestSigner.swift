import CryptoKit
import Foundation

/// Client half of the request-signing scheme in `lib/hermes/crypto.ts`.
///
/// The canonical string must match the server's byte for byte:
///
///     HERMES-V1\n<METHOD>\n<path?query>\n<timestamp-ms>\n<nonce>\n<sha256-hex(body)>
///
/// Binding the method and path means a signature captured off one endpoint
/// cannot be replayed against another; binding the body digest means the
/// transcript cannot be rewritten in flight.
public enum RequestSigner {
    public struct Headers: Sendable {
        public let device: String
        public let timestamp: String
        public let nonce: String
        public let signature: String

        public var asDictionary: [String: String] {
            [
                "x-hermes-device": device,
                "x-hermes-timestamp": timestamp,
                "x-hermes-nonce": nonce,
                "x-hermes-signature": signature,
            ]
        }
    }

    public static func sign(
        method: String,
        path: String,
        body: String,
        credentials: Credentials,
        now: Date = Date()
    ) -> Headers {
        let timestamp = String(Int64(now.timeIntervalSince1970 * 1000))
        let nonce = randomNonce()
        let bodyHash = SHA256.hash(data: Data(body.utf8))
            .map { String(format: "%02x", $0) }
            .joined()

        let canonical = [
            "HERMES-V1",
            method.uppercased(),
            path,
            timestamp,
            nonce,
            bodyHash,
        ].joined(separator: "\n")

        let mac = HMAC<SHA256>.authenticationCode(
            for: Data(canonical.utf8),
            using: SymmetricKey(data: Data(credentials.deviceSecret.utf8))
        )

        return Headers(
            device: credentials.deviceId,
            timestamp: timestamp,
            nonce: nonce,
            signature: base64URL(Data(mac))
        )
    }

    private static func randomNonce() -> String {
        var bytes = [UInt8](repeating: 0, count: 16)
        // SecRandomCopyBytes is the CSPRNG; fall back to the Swift RNG only if
        // the Security framework somehow refuses, which should never happen.
        if SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes) != errSecSuccess {
            bytes = (0..<16).map { _ in UInt8.random(in: 0...255) }
        }
        return base64URL(Data(bytes))
    }

    static func base64URL(_ data: Data) -> String {
        data.base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
    }
}
