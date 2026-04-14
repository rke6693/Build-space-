//
//  ContributorRow.swift
//  KoruUI
//
//  A single row in the insights page — label, value bar, delta text.
//  Used in the main screen's third crown page and in the widget.
//

import SwiftUI
import KoruCore

public struct ContributorRow: View {
    public let component: ScoreComponent
    public var compact: Bool = false

    @Environment(\.koruTheme) private var theme
    @Environment(\.colorScheme) private var scheme

    public init(component: ScoreComponent, compact: Bool = false) {
        self.component = component
        self.compact = compact
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: compact ? 2 : 4) {
            HStack {
                Text(component.kind.label)
                    .font(compact ? KoruFont.caption : KoruFont.bodyEmphasis)
                    .koruForeground(KoruColors.ink)
                Spacer(minLength: 4)
                Text(component.subtitle)
                    .font(KoruFont.caption)
                    .koruForeground(KoruColors.inkDim)
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
            }
            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    RoundedRectangle(cornerRadius: 3)
                        .fill(KoruColors.hairline.resolve(theme, colorScheme: scheme))
                        .frame(height: compact ? 4 : 5)
                    RoundedRectangle(cornerRadius: 3)
                        .fill(AuroraGradient.linear(theme: theme, colorScheme: scheme))
                        .frame(
                            width: geo.size.width * CGFloat(component.value) / 100,
                            height: compact ? 4 : 5
                        )
                }
            }
            .frame(height: compact ? 4 : 5)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(component.kind.label), \(component.value) out of 100")
        .accessibilityValue(component.subtitle)
    }
}
