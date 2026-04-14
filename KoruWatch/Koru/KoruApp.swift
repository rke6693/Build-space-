//
//  KoruApp.swift
//  Koru Watch App
//
//  App entry point. Builds the root scene, injects the HealthStore
//  and the Koru theme, and registers background tasks on first launch.
//

import SwiftUI
import KoruCore
import KoruHealth
import KoruUI
#if canImport(WatchKit)
import WatchKit
#endif

@main
struct KoruApp: App {
    @StateObject private var appModel = AppModel()

    var body: some Scene {
        WindowGroup {
            AppRoot()
                .environmentObject(appModel)
                .environment(\.koruTheme, appModel.effectiveTheme)
                .environment(\.koruDevice, KoruDeviceClass.current())
        }
    }
}
