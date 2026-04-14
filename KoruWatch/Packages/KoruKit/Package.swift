// swift-tools-version: 5.9
//
// KoruKit — shared Swift package powering the Koru Watch app, its
// widget extension, and the unit test target. Module boundaries keep
// scoring logic pure, HealthKit isolated, and SwiftUI layered on top.
//

import PackageDescription

let package = Package(
    name: "KoruKit",
    defaultLocalization: "en",
    platforms: [
        .watchOS(.v11),
        .macOS(.v14),          // KoruCore can compile on macOS for CI & Previews
        .iOS(.v17)
    ],
    products: [
        // Pure Swift scoring engine — zero Apple framework imports beyond Foundation.
        // Compiles on Linux if needed; trivially unit-testable.
        .library(name: "KoruCore",        targets: ["KoruCore"]),

        // HealthKit bridge + storage. Depends on KoruCore.
        .library(name: "KoruHealth",      targets: ["KoruHealth"]),

        // Design system + shared SwiftUI components.
        .library(name: "KoruUI",          targets: ["KoruUI"]),

        // Widget timeline + relevance logic, used by the widget extension target.
        .library(name: "KoruWidgetsKit",  targets: ["KoruWidgetsKit"]),
    ],
    targets: [
        .target(
            name: "KoruCore",
            path: "Sources/KoruCore"
        ),
        .target(
            name: "KoruHealth",
            dependencies: ["KoruCore"],
            path: "Sources/KoruHealth"
        ),
        .target(
            name: "KoruUI",
            dependencies: ["KoruCore"],
            path: "Sources/KoruUI"
        ),
        .target(
            name: "KoruWidgetsKit",
            dependencies: ["KoruCore", "KoruUI"],
            path: "Sources/KoruWidgetsKit"
        ),
        .testTarget(
            name: "KoruCoreTests",
            dependencies: ["KoruCore"],
            path: "Tests/KoruCoreTests"
        ),
    ]
)
