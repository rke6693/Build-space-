import Foundation

/// A deliberately small mirror of the server's rule engine, used for one thing:
/// showing the right icon and label the instant the user stops speaking,
/// instead of a spinner while the round trip happens.
///
/// It is not the source of truth — the relay's answer replaces it as soon as it
/// arrives, and the relay has the model pass and the full time parser. This is
/// perceived latency, not logic.
public enum IntentPreview {
    public static func guess(_ transcript: String) -> CaptureIntent {
        let text = transcript
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .lowercased()
        guard !text.isEmpty else { return .unknown }

        if text.hasPrefix("remind me")
            || text.hasPrefix("don't forget")
            || text.hasPrefix("dont forget")
            || text.hasPrefix("remember to") {
            return .reminder
        }
        if text.hasPrefix("set a timer") || text.hasPrefix("start a timer") || text.hasPrefix("set timer") {
            return .timer
        }
        if (text.hasPrefix("add ") && text.contains(" to ")) || (text.hasPrefix("put ") && text.contains(" on ")) {
            return .listAdd
        }
        if text.hasPrefix("tell ") || text.hasPrefix("text ") || text.hasPrefix("message ") || text.hasPrefix("email ") {
            return .message
        }
        if text.hasPrefix("note") || text.hasPrefix("jot down") || text.hasPrefix("idea") {
            return .note
        }
        if text.hasPrefix("i need to") || text.hasPrefix("i have to") || text.hasPrefix("i should") {
            return .task
        }
        if text.hasSuffix("?") || questionOpeners.contains(where: { text.hasPrefix($0 + " ") }) {
            return .question
        }
        return .note
    }

    private static let questionOpeners = [
        "what", "when", "where", "who", "why", "how", "which",
        "is", "are", "can", "could", "would", "should", "do", "does", "did", "will",
    ]
}
