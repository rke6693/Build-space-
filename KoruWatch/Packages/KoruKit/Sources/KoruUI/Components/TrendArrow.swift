//
//  TrendArrow.swift
//  KoruUI
//
//  Up/down/flat directional glyph used under the score numeral.
//  Communicates trend via *shape*, not just color, so the UI remains
//  legible in color-blind and Increase Contrast modes.
//

import SwiftUI

public struct TrendArrow: View {
    public let delta: Int
    public var size: CGFloat = 14

    public init(delta: Int, size: CGFloat = 14) {
        self.delta = delta
        self.size = size
    }

    public var body: some View {
        Image(systemName: icon)
            .font(.system(size: size, weight: .bold))
            .foregroundStyle(color)
            .accessibilityLabel(label)
    }

    private var icon: String {
        if delta > 2 { return "arrow.up" }
        if delta < -2 { return "arrow.down" }
        return "minus"
    }

    private var color: Color {
        if delta > 2 { return Color.hex("37E2D5") }
        if delta < -2 { return Color.hex("FF6B6B") }
        return Color.hex("7B5CFF")
    }

    private var label: String {
        if delta > 2 { return "trending up by \(delta)" }
        if delta < -2 { return "trending down by \(abs(delta))" }
        return "trend flat"
    }
}
