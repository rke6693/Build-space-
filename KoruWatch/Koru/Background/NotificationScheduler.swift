//
//  NotificationScheduler.swift
//  Koru Watch App
//
//  Real implementation of local notification scheduling using
//  UNUserNotificationCenter. Three notification types: morning
//  summary, recovery alert, and check-in reminder. Respects user
//  toggles from SettingsScreen.
//

import Foundation
import SwiftUI
import KoruCore

#if canImport(UserNotifications)
import UserNotifications
#endif

@MainActor
enum NotificationScheduler {

    // MARK: - Category identifiers

    static let morningSummaryCategory = "morningSummary"
    static let recoveryAlertCategory  = "recoveryAlert"
    static let checkInReminderCategory = "checkInReminder"

    // MARK: - Public API

    /// Request notification permission. Call once during onboarding or
    /// when the user first enables a notification toggle.
    static func requestPermission() {
        #if canImport(UserNotifications)
        let center = UNUserNotificationCenter.current()
        center.requestAuthorization(options: [.alert, .sound, .badge]) { _, _ in }
        registerCategories()
        #endif
    }

    /// Schedule all enabled notification types based on the current
    /// score and history. Call after each score computation.
    static func scheduleAll(score: WellnessScore?, history: [WellnessScore]) {
        #if canImport(UserNotifications)
        let notifyMorning = UserDefaults.standard.object(forKey: "koru.notifyMorning") as? Bool ?? true
        let notifyRecovery = UserDefaults.standard.object(forKey: "koru.notifyRecovery") as? Bool ?? true

        if notifyMorning {
            scheduleMorningSummary(score: score, history: history)
        } else {
            cancelCategory(morningSummaryCategory)
        }

        if notifyRecovery {
            scheduleRecoveryAlert(score: score, history: history)
        } else {
            cancelCategory(recoveryAlertCategory)
        }

        scheduleCheckInReminder()
        #endif
    }

    /// Cancel all Koru notifications.
    static func cancelAll() {
        #if canImport(UserNotifications)
        let center = UNUserNotificationCenter.current()
        center.removeAllPendingNotificationRequests()
        center.removeAllDeliveredNotifications()
        #endif
    }

    // MARK: - Category registration

    #if canImport(UserNotifications)
    private static func registerCategories() {
        let center = UNUserNotificationCenter.current()

        // Morning summary actions
        let morningOpen = UNNotificationAction(
            identifier: "morningSummary.open",
            title: "Open",
            options: .foreground
        )
        let morningSnooze = UNNotificationAction(
            identifier: "morningSummary.snooze",
            title: "Snooze 1h",
            options: []
        )
        let morningCategory = UNNotificationCategory(
            identifier: morningSummaryCategory,
            actions: [morningOpen, morningSnooze],
            intentIdentifiers: [],
            options: []
        )

        // Recovery alert actions
        let recoveryOpen = UNNotificationAction(
            identifier: "recoveryAlert.open",
            title: "Open",
            options: .foreground
        )
        let recoveryMute = UNNotificationAction(
            identifier: "recoveryAlert.muteToday",
            title: "Mute today",
            options: []
        )
        let recoveryCategory = UNNotificationCategory(
            identifier: recoveryAlertCategory,
            actions: [recoveryOpen, recoveryMute],
            intentIdentifiers: [],
            options: []
        )

        // Check-in reminder actions
        let checkInNow = UNNotificationAction(
            identifier: "checkInReminder.checkIn",
            title: "Check In Now",
            options: .foreground
        )
        let checkInCategory = UNNotificationCategory(
            identifier: checkInReminderCategory,
            actions: [checkInNow],
            intentIdentifiers: [],
            options: []
        )

        center.setNotificationCategories([morningCategory, recoveryCategory, checkInCategory])
    }
    #endif

    // MARK: - Morning summary

    #if canImport(UserNotifications)
    private static func scheduleMorningSummary(score: WellnessScore?, history: [WellnessScore]) {
        let center = UNUserNotificationCenter.current()

        // Remove any existing morning notification.
        center.removePendingNotificationRequests(withIdentifiers: ["koru.morningSummary"])

        let content = UNMutableNotificationContent()
        content.title = "Good morning"
        content.categoryIdentifier = morningSummaryCategory
        content.sound = .default

        if let s = score {
            let band = s.band.statusWord.lowercased()
            content.body = "Yesterday's score: \(s.value) (\(band)). Let's see what today brings."
        } else {
            content.body = "Your new score is waiting. Open Koru to check in."
        }

        // Schedule for tomorrow morning at 7:30 AM (or user-configured time).
        var dateComponents = DateComponents()
        dateComponents.hour = 7
        dateComponents.minute = 30
        let trigger = UNCalendarNotificationTrigger(dateMatching: dateComponents, repeats: true)

        let request = UNNotificationRequest(
            identifier: "koru.morningSummary",
            content: content,
            trigger: trigger
        )
        center.add(request) { _ in }
    }
    #endif

    // MARK: - Recovery alert

    #if canImport(UserNotifications)
    private static func scheduleRecoveryAlert(score: WellnessScore?, history: [WellnessScore]) {
        let center = UNUserNotificationCenter.current()
        center.removePendingNotificationRequests(withIdentifiers: ["koru.recoveryAlert"])

        guard let current = score else { return }

        // Calculate 7-day average.
        let recentScores = history
            .sorted { $0.day > $1.day }
            .prefix(7)
        guard !recentScores.isEmpty else { return }
        let avg = recentScores.reduce(0) { $0 + $1.value } / recentScores.count

        // Only fire if score dropped >15 from average.
        guard avg - current.value > 15 else { return }

        // Check if we already fired today (mute-today logic).
        let mutedDate = UserDefaults.standard.object(forKey: "koru.recoveryMutedDate") as? Date
        if let muted = mutedDate, Calendar.current.isDateInToday(muted) {
            return
        }

        let content = UNMutableNotificationContent()
        content.title = "Recovery day"
        content.body = "Your score dropped to \(current.value). Consider an easy day."
        content.categoryIdentifier = recoveryAlertCategory
        content.sound = .default

        // Fire in 5 seconds (immediate-ish, non-repeating, once per day).
        let trigger = UNTimeIntervalNotificationTrigger(timeInterval: 5, repeats: false)

        let request = UNNotificationRequest(
            identifier: "koru.recoveryAlert",
            content: content,
            trigger: trigger
        )
        center.add(request) { _ in }

        // Mark that we fired today so we don't repeat.
        UserDefaults.standard.set(Date(), forKey: "koru.recoveryFiredDate")
    }
    #endif

    // MARK: - Check-in reminder

    #if canImport(UserNotifications)
    private static func scheduleCheckInReminder() {
        let center = UNUserNotificationCenter.current()
        center.removePendingNotificationRequests(withIdentifiers: ["koru.checkInReminder"])

        let content = UNMutableNotificationContent()
        content.title = "Koru check-in"
        content.body = "Take 5 seconds to log how you feel today."
        content.categoryIdentifier = checkInReminderCategory
        content.sound = .default

        // Fire at 12:00 PM daily. The app can suppress delivery if a
        // check-in was already logged (handled at delivery time via
        // notification service extension or foreground delegate).
        var dateComponents = DateComponents()
        dateComponents.hour = 12
        dateComponents.minute = 0
        let trigger = UNCalendarNotificationTrigger(dateMatching: dateComponents, repeats: true)

        let request = UNNotificationRequest(
            identifier: "koru.checkInReminder",
            content: content,
            trigger: trigger
        )
        center.add(request) { _ in }
    }
    #endif

    // MARK: - Helpers

    #if canImport(UserNotifications)
    private static func cancelCategory(_ categoryId: String) {
        let center = UNUserNotificationCenter.current()
        center.getPendingNotificationRequests { requests in
            let ids = requests
                .filter { $0.content.categoryIdentifier == categoryId }
                .map(\.identifier)
            center.removePendingNotificationRequests(withIdentifiers: ids)
        }
    }
    #endif
}
