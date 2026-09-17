import CryptoKit
import XCTest

// HermesKit is compiled into this bundle as source (see project.yml), so its
// types are in the same module — no import needed.

/// Cross-language contract with the relay.
///
/// The same vector is asserted server-side in `tests/unit/hermes-vector.test.ts`.
/// These two tests exist because nothing builds Swift in the web project's CI
/// and nothing runs Node in Xcode — so the only thing keeping the signing
/// schemes identical is that both sides agree on this one fixed case.
///
/// If this fails, the watch would authenticate against nothing: fix the
/// canonical string here, do not change the expectation.
final class RequestSignerTests: XCTestCase {
    private enum Vector {
        static let secret = "test-device-secret-do-not-use"
        static let method = "POST"
        static let path = "/api/hermes/capture"
        static let timestamp: Int64 = 1_789_000_000_000
        static let nonce = "AAAAAAAAAAAAAAAAAAAAAA"
        static let body = #"{"captures":[{"capturedAt":"2026-09-16T10:00:00.000Z","clientId":"11111111-2222-3333-4444-555555555555","source":"action_button","transcript":"remind me to call mom tomorrow at 4pm","utcOffsetMinutes":-420}]}"#
        static let expectedBodyHash = "c0c9b19ce8c54d12f999cff9d851adc6e03b7e9f30aa5baf5089dcb6c98fc856"
        static let expectedSignature = "vZ-BybQV5pT7sF0nclC5woXMxFYY2wHGNcVb86hMri8"
    }

    func testBodyDigestMatchesRelay() {
        let hash = SHA256.hash(data: Data(Vector.body.utf8))
            .map { String(format: "%02x", $0) }
            .joined()
        XCTAssertEqual(hash, Vector.expectedBodyHash)
    }

    func testSignatureMatchesRelay() {
        let credentials = Credentials(
            deviceId: "device_test",
            deviceSecret: Vector.secret,
            endpoint: URL(string: "https://example.com")!
        )

        let headers = RequestSigner.sign(
            method: Vector.method,
            path: Vector.path,
            body: Vector.body,
            credentials: credentials,
            now: Date(timeIntervalSince1970: TimeInterval(Vector.timestamp) / 1000)
        )

        XCTAssertEqual(headers.timestamp, String(Vector.timestamp))
        XCTAssertEqual(headers.device, "device_test")

        // The nonce is random per request, so re-derive the expected MAC using
        // the nonce this call actually produced.
        let canonical = [
            "HERMES-V1",
            Vector.method,
            Vector.path,
            String(Vector.timestamp),
            headers.nonce,
            Vector.expectedBodyHash,
        ].joined(separator: "\n")

        let mac = HMAC<SHA256>.authenticationCode(
            for: Data(canonical.utf8),
            using: SymmetricKey(data: Data(Vector.secret.utf8))
        )
        XCTAssertEqual(headers.signature, RequestSigner.base64URL(Data(mac)))
    }

    /// The pinned case, with the nonce held fixed, is what actually proves the
    /// two languages agree byte for byte.
    func testPinnedVector() {
        let canonical = [
            "HERMES-V1",
            Vector.method,
            Vector.path,
            String(Vector.timestamp),
            Vector.nonce,
            Vector.expectedBodyHash,
        ].joined(separator: "\n")

        let mac = HMAC<SHA256>.authenticationCode(
            for: Data(canonical.utf8),
            using: SymmetricKey(data: Data(Vector.secret.utf8))
        )
        XCTAssertEqual(RequestSigner.base64URL(Data(mac)), Vector.expectedSignature)
    }

    func testNonceIsWithinTheRelaysAcceptedLength() {
        let credentials = Credentials(
            deviceId: "device_test",
            deviceSecret: Vector.secret,
            endpoint: URL(string: "https://example.com")!
        )
        let headers = RequestSigner.sign(method: "GET", path: "/api/hermes/inbox?limit=20", body: "", credentials: credentials)
        // The relay rejects anything outside 8...128 characters.
        XCTAssertGreaterThanOrEqual(headers.nonce.count, 8)
        XCTAssertLessThanOrEqual(headers.nonce.count, 128)
    }
}
