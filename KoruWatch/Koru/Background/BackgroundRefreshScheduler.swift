//
//  BackgroundRefreshScheduler.swift
//  Koru Watch App
//
//  Schedules a watchOS background refresh roughly every 30 minutes
//  while the user is wearing the watch. Each wake re-reads the
//  HealthKit anchors, recomputes today's score, persists history,
//  and reloads the widget timeline.
//

import Foundation
#if canImport(WatchKit)
import WatchKit
#endif
import KoruCore
import KoruHealth

enum BackgroundRefreshScheduler {

    /// Schedule the next wake. Call from the app's extension delegate
    /// AFTER a refresh has completed to chain the next one.
    static func scheduleNext(after minutes: Int = 30) {
        #if canImport(WatchKit) && os(watchOS)
        let fireDate = Date().addingTimeInterval(TimeInterval(minutes * 60))
        WKExtension.shared().scheduleBackgroundRefresh(
            withPreferredDate: fireDate,
            userInfo: nil
        ) { error in
            if let error = error {
                print("Koru: failed to schedule background refresh \(error)")
            }
        }
        #endif
    }
}
