#if os(watchOS)
import WatchKit

/// Haptics carry the whole confirmation story on a watch you never look at.
/// The user should be able to press, speak, drop their wrist, and know from the
/// feel alone whether it landed.
public enum Haptics {
    /// Capture started — a single click, like a switch.
    public static func listening() { WKInterfaceDevice.current().play(.start) }

    /// Speech ended, upload in flight.
    public static func thinking() { WKInterfaceDevice.current().play(.click) }

    /// The relay confirmed the agent received it. This is the one that means
    /// "you can stop paying attention now".
    public static func delivered() { WKInterfaceDevice.current().play(.success) }

    /// Queued offline. Distinct from delivered on purpose — it means "saved,
    /// not yet sent", and the user deserves to know the difference.
    public static func queued() { WKInterfaceDevice.current().play(.notification) }

    /// Nothing heard, or the relay rejected it.
    public static func failed() { WKInterfaceDevice.current().play(.failure) }
}
#endif
