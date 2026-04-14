//
//  WidgetRelevance.swift
//  KoruWidgetsKit
//
//  Computes Smart Stack relevance scores for each entry so watchOS
//  surfaces Koru at the right moment: in the morning, around workouts,
//  and before sleep.
//

import Foundation
import WidgetKit

public enum KoruWidgetRelevance {

    public static func relevance(for date: Date) -> TimelineEntryRelevance {
        let cal = Calendar.current
        let hour = cal.component(.hour, from: date)
        let score: Float
        switch hour {
        case 6...8:       score = 100   // morning summary
        case 21...23, 0:  score = 90    // pre-sleep review
        case 12...13:     score = 60    // midday glance
        case 16...18:     score = 70    // post-workout window
        default:          score = 30
        }
        return TimelineEntryRelevance(score: score, duration: 3600)
    }
}
