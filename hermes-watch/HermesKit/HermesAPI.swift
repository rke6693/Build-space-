import Foundation

public enum HermesError: LocalizedError, Sendable {
    case notPaired
    case server(status: Int, message: String)
    case transport(String)
    case decoding(String)

    public var errorDescription: String? {
        switch self {
        case .notPaired: "Not paired yet"
        case let .server(status, message):
            status == 409 ? "Already sent" : "Relay error \(status): \(message)"
        case let .transport(message): message
        case let .decoding(message): "Bad response: \(message)"
        }
    }

    /// Whether re-sending the exact same request could plausibly succeed later.
    /// A 4xx means the capture is wrong or already recorded — retrying it
    /// forever would just burn battery.
    public var isRetryable: Bool {
        switch self {
        case .transport: true
        case let .server(status, _): status >= 500 || status == 429
        case .notPaired: true
        case .decoding: false
        }
    }
}

/// Thin, dependency-free client for the relay. Every call is signed; nothing
/// here holds state beyond the credentials it is handed.
public struct HermesAPI: Sendable {
    private let credentials: Credentials
    private let session: URLSession

    public init(credentials: Credentials, session: URLSession = .hermesDefault) {
        self.credentials = credentials
        self.session = session
    }

    // MARK: - Pairing (unsigned: the code is the credential)

    public struct PairResponse: Codable, Sendable {
        public let ok: Bool
        public let deviceId: String
        public let deviceSecret: String
        public let endpoint: String
    }

    public static func pair(
        endpoint: URL,
        code: String,
        deviceName: String,
        platform: String,
        model: String?,
        session: URLSession = .hermesDefault
    ) async throws -> Credentials {
        var request = URLRequest(url: endpoint.appendingPathComponent("api/hermes/pair"))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "content-type")
        request.httpBody = try JSONEncoder().encode([
            "code": code,
            "deviceName": deviceName,
            "platform": platform,
            "model": model ?? "",
        ].compactMapValues { $0.isEmpty ? nil : $0 })

        let (data, response) = try await send(request, session: session)
        try check(response: response, data: data)

        let decoded = try JSONDecoder().decode(PairResponse.self, from: data)
        guard let resolved = URL(string: decoded.endpoint) else {
            throw HermesError.decoding("relay returned an unusable endpoint")
        }
        return Credentials(
            deviceId: decoded.deviceId,
            deviceSecret: decoded.deviceSecret,
            endpoint: resolved
        )
    }

    // MARK: - Captures

    private struct CaptureBatch: Encodable {
        let captures: [Capture]
    }

    private struct CaptureResponse: Decodable {
        let ok: Bool
        let results: [CaptureResult]
    }

    /// Sends a whole batch in one signed request. The watch always uses the
    /// batch shape, even for a single capture, so the flush path and the
    /// happy path are the same code.
    public func send(_ captures: [Capture]) async throws -> [CaptureResult] {
        let body = String(decoding: try Self.encoder.encode(CaptureBatch(captures: captures)), as: UTF8.self)
        let request = try signedRequest(method: "POST", path: "/api/hermes/capture", body: body)
        let (data, response) = try await Self.send(request, session: session)
        try Self.check(response: response, data: data)
        return try Self.decoder.decode(CaptureResponse.self, from: data).results
    }

    // MARK: - Inbox

    private struct InboxResponse: Decodable {
        let ok: Bool
        let messages: [InboxMessage]
    }

    public func inbox(since: Date? = nil, limit: Int = 20) async throws -> [InboxMessage] {
        var query = "limit=\(limit)"
        if let since {
            let iso = ISO8601DateFormatter.hermes.string(from: since)
            // The query string is part of the signature, so it has to be encoded
            // once, here, and reused verbatim in the URL.
            let escaped = iso.addingPercentEncoding(withAllowedCharacters: .alphanumerics) ?? iso
            query += "&since=\(escaped)"
        }
        let path = "/api/hermes/inbox?\(query)"
        let request = try signedRequest(method: "GET", path: path, body: "")
        let (data, response) = try await Self.send(request, session: session)
        try Self.check(response: response, data: data)
        return try Self.decoder.decode(InboxResponse.self, from: data).messages
    }

    public func markRead(_ ids: [String]) async throws {
        guard !ids.isEmpty else { return }
        let body = String(decoding: try Self.encoder.encode(["ids": ids]), as: UTF8.self)
        let request = try signedRequest(method: "POST", path: "/api/hermes/inbox", body: body)
        let (data, response) = try await Self.send(request, session: session)
        try Self.check(response: response, data: data)
    }

    // MARK: - Plumbing

    private func signedRequest(method: String, path: String, body: String) throws -> URLRequest {
        guard var components = URLComponents(
            url: credentials.endpoint,
            resolvingAgainstBaseURL: false
        ) else {
            throw HermesError.transport("bad endpoint")
        }
        // `path` already carries its own query; splitting keeps the string we
        // sign identical to the one the server reconstructs from the request.
        let parts = path.split(separator: "?", maxSplits: 1, omittingEmptySubsequences: false)
        components.path = String(parts[0])
        components.percentEncodedQuery = parts.count > 1 ? String(parts[1]) : nil

        guard let url = components.url else { throw HermesError.transport("bad url") }

        var request = URLRequest(url: url)
        request.httpMethod = method
        if !body.isEmpty {
            request.httpBody = Data(body.utf8)
            request.setValue("application/json", forHTTPHeaderField: "content-type")
        }
        for (key, value) in RequestSigner.sign(
            method: method,
            path: path,
            body: body,
            credentials: credentials
        ).asDictionary {
            request.setValue(value, forHTTPHeaderField: key)
        }
        return request
    }

    private static func send(_ request: URLRequest, session: URLSession) async throws -> (Data, URLResponse) {
        do {
            return try await session.data(for: request)
        } catch {
            throw HermesError.transport(error.localizedDescription)
        }
    }

    private static func check(response: URLResponse, data: Data) throws {
        guard let http = response as? HTTPURLResponse else {
            throw HermesError.transport("no response")
        }
        guard (200..<300).contains(http.statusCode) else {
            let message = (try? JSONDecoder().decode([String: String].self, from: data))?["error"]
                ?? String(data: data, encoding: .utf8)?.prefix(120).description
                ?? "unknown"
            throw HermesError.server(status: http.statusCode, message: message)
        }
    }

    private static let encoder: JSONEncoder = {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .custom { date, encoder in
            var container = encoder.singleValueContainer()
            try container.encode(ISO8601DateFormatter.hermes.string(from: date))
        }
        // Stable key order: the body is what gets hashed, so it must serialize
        // identically on both sides of a retry.
        encoder.outputFormatting = [.sortedKeys]
        return encoder
    }()

    private static let decoder: JSONDecoder = {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .custom { decoder in
            let raw = try decoder.singleValueContainer().decode(String.self)
            guard let date = ISO8601DateFormatter.hermes.date(from: raw)
                ?? ISO8601DateFormatter.hermesNoFraction.date(from: raw) else {
                throw HermesError.decoding("unparseable date \(raw)")
            }
            return date
        }
        return decoder
    }()
}

public extension URLSession {
    /// Short timeouts: a watch waiting on a hung socket is worse than a watch
    /// that queues the capture and retries when it next has signal.
    static let hermesDefault: URLSession = {
        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 15
        config.timeoutIntervalForResource = 60
        config.waitsForConnectivity = false
        config.allowsExpensiveNetworkAccess = true
        config.allowsConstrainedNetworkAccess = true
        return URLSession(configuration: config)
    }()
}

extension ISO8601DateFormatter {
    static let hermes: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter
    }()

    static let hermesNoFraction: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime]
        return formatter
    }()
}
