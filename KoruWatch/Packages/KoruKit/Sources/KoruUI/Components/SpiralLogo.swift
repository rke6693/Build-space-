//
//  SpiralLogo.swift
//  KoruUI
//
//  Parametric Archimedean-ish spiral drawn directly with a SwiftUI
//  Path. Same math as the one in `prototype/koru.js` so the logo
//  looks identical in the web prototype and the real app.
//

import SwiftUI

public struct SpiralLogo: View {
    public var turns: Double = 1.6
    public var segments: Int = 72
    public var lineWidth: CGFloat = 4
    public var gradient: AnyShapeStyle?

    public init(turns: Double = 1.6, segments: Int = 72, lineWidth: CGFloat = 4, gradient: AnyShapeStyle? = nil) {
        self.turns = turns
        self.segments = segments
        self.lineWidth = lineWidth
        self.gradient = gradient
    }

    public var body: some View {
        GeometryReader { geo in
            let size = min(geo.size.width, geo.size.height)
            let center = CGPoint(x: geo.size.width / 2, y: geo.size.height / 2)
            let maxR = size * 0.42

            SpiralShape(turns: turns, segments: segments, center: center, maxR: maxR)
                .stroke(style: StrokeStyle(lineWidth: lineWidth, lineCap: .round, lineJoin: .round))
                .foregroundStyle(gradient ?? AnyShapeStyle(LinearGradient(
                    colors: [.cyan, .purple, .pink],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )))
        }
    }

    private struct SpiralShape: Shape {
        var turns: Double
        var segments: Int
        var center: CGPoint
        var maxR: CGFloat

        func path(in rect: CGRect) -> Path {
            var p = Path()
            let totalTheta = turns * 2 * .pi
            for i in 0...segments {
                let t = Double(i) / Double(segments)
                let tEase = pow(t, 1.25)
                let theta = tEase * totalTheta
                let r = tEase * Double(maxR)
                let x = Double(center.x) + r * cos(theta)
                let y = Double(center.y) + r * sin(theta)
                let pt = CGPoint(x: x, y: y)
                if i == 0 { p.move(to: pt) } else { p.addLine(to: pt) }
            }
            return p
        }
    }
}

#Preview {
    SpiralLogo(lineWidth: 6)
        .frame(width: 120, height: 120)
        .padding()
        .background(.black)
}
