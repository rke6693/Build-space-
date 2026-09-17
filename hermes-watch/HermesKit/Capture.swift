import Foundation

/// How the capture was started. The server records it, which makes it possible
/// to tell later whether the Action button or the complication is what people
/// actually reach for.
public enum CaptureSource: String, Codable, Sendable {
    case actionButton = "action_button"
    case doubleTap = "double_tap"
    case complication
    case app
    case siri
    case phone
}

public enum CaptureIntent: String, Codable, Sendable, CaseIterable {
    case reminder = "REMINDER"
    case task = "TASK"
    case listAdd = "LIST_ADD"
    case note = "NOTE"
    case message = "MESSAGE"
    case question = "QUESTION"
    case timer = "TIMER"
    case unknown = "UNKNOWN"

    public var icon: String {
        switch self {
        case .reminder: "alarm.fill"
        case .task: "checkmark.circle.fill"
        case .listAdd: "list.bullet.rectangle.fill"
        case .note: "note.text"
        case .message: "bubble.left.fill"
        case .question: "questionmark.circle.fill"
        case .timer: "timer"
        case .unknown: "waveform"
        }
    }

    public var label: String {
        switch self {
        case .reminder: "Reminder"
        case .task: "Task"
        case .listAdd: "List"
        case .note: "Note"
        case .message: "Message"
        case .question: "Question"
        case .timer: "Timer"
        case .unknown: "Captured"
        }
    }
}

/// One press-and-speak event, exactly as it goes on the wire.
///
/// `clientId` is generated the instant the user stops speaking and never
/// changes, including across retries and app launches — it is what makes a
/// re-send idempotent instead of duplicating a reminder.
public struct Capture: Codable, Sendable, Identifiable, Equatable {
    public struct Coordinate: Codable, Sendable, Equatable {
        public let lat: Double
        public let lon: Double

        public init(lat: Double, lon: Double) {
            self.lat = lat
            self.lon = lon
        }
    }

    public let clientId: String
    public let transcript: String
    public let capturedAt: Date
    public let utcOffsetMinutes: Int
    public let timeZone: String?
    public let intentHint: CaptureIntent?
    public let source: CaptureSource
    public let location: Coordinate?
    public let batteryLevel: Double?

    public var id: String { clientId }

    public init(
        clientId: String = UUID().uuidString.lowercased(),
        transcript: String,
        capturedAt: Date = Date(),
        timeZone: TimeZone = .current,
        intentHint: CaptureIntent? = nil,
        source: CaptureSource = .app,
        location: Coordinate? = nil,
        batteryLevel: Double? = nil
    ) {
        self.clientId = clientId
        self.transcript = transcript
        self.capturedAt = capturedAt
        // Minutes to ADD to UTC for local time, matching the server's convention.
        self.utcOffsetMinutes = timeZone.secondsFromGMT(for: capturedAt) / 60
        self.timeZone = timeZone.identifier
        self.intentHint = intentHint
        self.source = source
        self.location = location
        self.batteryLevel = batteryLevel
    }
}

/// What the relay says it did with a capture.
public struct CaptureResult: Codable, Sendable, Identifiable {
    public struct Delivery: Codable, Sendable {
        public let channel: String
        public let status: String
        public let detail: String?
    }

    public let clientId: String
    public let captureId: String
    public let duplicate: Bool
    public let intent: CaptureIntent
    public let title: String
    public let dueAt: Date?
    public let summary: String
    public let status: String
    public let deliveries: [Delivery]

    public var id: String { clientId }
    public var reachedAgent: Bool { status == "DELIVERED" || status == "PARTIAL" }
}

public struct InboxMessage: Codable, Sendable, Identifiable {
    public let id: String
    public let channel: String
    public let body: String
    public let createdAt: Date
    public let read: Bool
}
