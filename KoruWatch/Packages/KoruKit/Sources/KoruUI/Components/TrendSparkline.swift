//
//  TrendSparkline.swift
//  KoruUI
//
//  7-day trend sparkline with aurora stroke and filled area, shown on
//  the second crown-scroll page of the main screen.
//

import SwiftUI
import KoruCore

public struct TrendSparkline: View {
    public let values: [Int]
    @Environment(\.koruTheme) private var theme
    @Environment(\.colorScheme) private var scheme

    public init(values: [Int]) {
        self.values = values
    }

    public var body: some View {
        GeometryReader { geo in
            let pts = points(in: geo.size)
            ZStack {
                // Area
                areaPath(from: pts, height: geo.size.height)
                    .fill(AuroraGradient.linear(theme: theme, colorScheme: scheme).opacity(0.18))
                // Line
                linePath(from: pts)
                    .stroke(AuroraGradient.linear(theme: theme, colorScheme: scheme),
                            style: StrokeStyle(lineWidth: 3, lineCap: .round, lineJoin: .round))
                // Last point
                if let last = pts.last {
                    Circle()
                        .fill(KoruColors.ink.resolve(theme, colorScheme: scheme))
                        .frame(width: 6, height: 6)
                        .position(last)
                }
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("7-day trend")
        .accessibilityValue(values.map(String.init).joined(separator: ", "))
    }

    private func points(in size: CGSize) -> [CGPoint] {
        guard values.count > 1 else { return [] }
        let pad: CGFloat = 6
        let minV = Double(values.min() ?? 0)
        let maxV = Double(values.max() ?? 100)
        let range = Swift.max(1, maxV - minV)
        let dx = (size.width - pad * 2) / CGFloat(values.count - 1)
        return values.enumerated().map { i, v in
            let x = pad + CGFloat(i) * dx
            let y = pad + (1 - (Double(v) - minV) / range) * Double(size.height - pad * 2)
            return CGPoint(x: x, y: y)
        }
    }

    private func linePath(from pts: [CGPoint]) -> Path {
        var p = Path()
        guard let first = pts.first else { return p }
        p.move(to: first)
        for pt in pts.dropFirst() { p.addLine(to: pt) }
        return p
    }

    private func areaPath(from pts: [CGPoint], height: CGFloat) -> Path {
        var p = linePath(from: pts)
        guard let last = pts.last, let first = pts.first else { return p }
        p.addLine(to: CGPoint(x: last.x, y: height))
        p.addLine(to: CGPoint(x: first.x, y: height))
        p.closeSubpath()
        return p
    }
}
