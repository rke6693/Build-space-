import Foundation
import UIKit
import GameKit
import Capacitor

/// Game Center for the web layer (see public/game/synthwing/js/native.js):
/// sign-in, leaderboard scores, achievements and the Game Center dashboard.
/// Every method settles its promise exactly once and never throws; when the
/// player isn't signed in, calls reject quietly and the game carries on.
@objc(GameCenterPlugin)
public class GameCenterPlugin: CAPPlugin, CAPBridgedPlugin, GKGameCenterControllerDelegate {
    public let identifier = "GameCenterPlugin"
    public let jsName = "GameCenter"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "authenticate", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "submitScore", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "reportAchievement", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "showDashboard", returnType: CAPPluginReturnPromise)
    ]

    private var pendingAuth: [CAPPluginCall] = []
    private var authStarted = false

    @objc func authenticate(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            let player = GKLocalPlayer.local
            if player.isAuthenticated {
                call.resolve(["authenticated": true])
                return
            }
            self.pendingAuth.append(call)
            if self.authStarted { return }
            self.authStarted = true
            // GameKit may call this more than once (sign-in sheet, then result).
            player.authenticateHandler = { [weak self] signInController, error in
                guard let self = self else { return }
                if let signInController = signInController {
                    self.bridge?.viewController?.present(signInController, animated: true)
                    return
                }
                let calls = self.pendingAuth
                self.pendingAuth.removeAll()
                for c in calls {
                    c.resolve(["authenticated": GKLocalPlayer.local.isAuthenticated,
                               "error": error?.localizedDescription ?? ""])
                }
            }
        }
    }

    @objc func submitScore(_ call: CAPPluginCall) {
        guard let board = call.getString("leaderboardId"), let score = call.getInt("score") else {
            call.reject("leaderboardId and score are required")
            return
        }
        guard GKLocalPlayer.local.isAuthenticated else {
            call.reject("Game Center is not signed in")
            return
        }
        GKLeaderboard.submitScore(score, context: 0, player: GKLocalPlayer.local, leaderboardIDs: [board]) { error in
            if let error = error { call.reject(error.localizedDescription) } else { call.resolve() }
        }
    }

    @objc func reportAchievement(_ call: CAPPluginCall) {
        guard let id = call.getString("achievementId") else {
            call.reject("achievementId is required")
            return
        }
        guard GKLocalPlayer.local.isAuthenticated else {
            call.reject("Game Center is not signed in")
            return
        }
        let achievement = GKAchievement(identifier: id)
        achievement.percentComplete = min(100, max(0, call.getDouble("percent") ?? 100))
        achievement.showsCompletionBanner = true
        GKAchievement.report([achievement]) { error in
            if let error = error { call.reject(error.localizedDescription) } else { call.resolve() }
        }
    }

    @objc func showDashboard(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard GKLocalPlayer.local.isAuthenticated, let host = self.bridge?.viewController else {
                call.reject("Game Center is not available")
                return
            }
            let dashboard = GKGameCenterViewController(state: .default)
            dashboard.gameCenterDelegate = self
            host.present(dashboard, animated: true)
            call.resolve()
        }
    }

    public func gameCenterViewControllerDidFinish(_ gameCenterViewController: GKGameCenterViewController) {
        gameCenterViewController.dismiss(animated: true)
    }
}
