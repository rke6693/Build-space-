//
//  WidgetEntry.swift
//  KoruWidgetsKit
//
//  Timeline entry shared between the main widget target and previews.
//

import Foundation
import KoruCore
import WidgetKit

public struct KoruWidgetEntry: TimelineEntry, Sendable {
    public let date: Date
    public let score: WellnessScore?
    public let fallbackReason: String?
    public let relevance: TimelineEntryRelevance?

    public init(
        date: Date,
        score: WellnessScore?,
        fallbackReason: String? = nil,
        relevance: TimelineEntryRelevance? = nil
    ) {
        self.date = date
        self.score = score
        self.fallbackReason = fallbackReason
        self.relevance = relevance
    }
}
