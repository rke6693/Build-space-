//
//  ScoreNumeral.swift
//  KoruUI
//
//  The 96 / 88 / 80 pt tabular score numeral that sits inside the ring.
//  Counts in smoothly on change, supports Dynamic Type via a
//  minimumScaleFactor so accessibility sizes never cause clipping.
//

import SwiftUI
import KoruCore

public struct ScoreNumeral: View {
    public let value: Int
    public let fontSize: CGFloat

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var displayed: Int = 0

    public init(value: Int, fontSize: CGFloat = 96) {
        self.value = value
        self.fontSize = fontSize
    }

    public var body: some View {
        Text("\(displayed)")
            .font(KoruFont.scoreNumeral(size: fontSize))
            .monospacedDigit()
            .kerning(-2)
            .minimumScaleFactor(0.6)
            .lineLimit(1)
            .onAppear {
                if reduceMotion {
                    displayed = value
                } else {
                    countTo(target: value)
                }
            }
            .onChange(of: value) { _, new in
                if reduceMotion {
                    displayed = new
                } else {
                    countTo(target: new)
                }
            }
    }

    private func countTo(target: Int) {
        let duration: TimeInterval = 0.75
        let steps = 28
        let start = displayed
        let delta = target - start
        guard delta != 0 else { return }
        for i in 1...steps {
            let t = Double(i) / Double(steps)
            let eased = 1 - pow(1 - t, 3)
            DispatchQueue.main.asyncAfter(deadline: .now() + duration * t) {
                displayed = start + Int((Double(delta) * eased).rounded())
            }
        }
    }
}
