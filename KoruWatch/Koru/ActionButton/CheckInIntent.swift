//
//  CheckInIntent.swift
//  Koru Watch App
//
//  The AppIntent that opens the check-in sheet. Hooked up to:
//    • Ultra 2 Action Button (requires `com.apple.developer.action-button`
//      entitlement — gated by Apple)
//    • Series 9 Double Tap (automatic when the app is foregrounded)
//    • Siri / Shortcuts
//    • Deep-link URL from the widget (koru://checkin)
//
//  When the entitlement isn't approved yet, the toolbar button in
//  MainPager.swift is the reliable fallback on every hardware class.
//

import AppIntents
import SwiftUI
import KoruCore
import KoruHealth

struct KoruCheckInIntent: AppIntent {
    static var title: LocalizedStringResource = "Koru Check-in"
    static var description = IntentDescription("Log a quick mood / energy / stress check-in with Koru.")

    static var openAppWhenRun: Bool { true }

    @MainActor
    func perform() async throws -> some IntentResult {
        NotificationCenter.default.post(name: .koruPresentCheckIn, object: nil)
        return .result()
    }
}

public extension Notification.Name {
    static let koruPresentCheckIn = Notification.Name("koru.presentCheckIn")
}

struct KoruAppShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: KoruCheckInIntent(),
            phrases: [
                "Log a \(.applicationName) check-in",
                "Check in with \(.applicationName)",
            ],
            shortTitle: "Check In",
            systemImageName: "checkmark.circle.fill"
        )
    }
}
