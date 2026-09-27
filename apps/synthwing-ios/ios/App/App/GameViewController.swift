import UIKit
import WebKit
import Capacitor

/// Hosts the game full screen. Capacitor's SystemBars plugin hides the status
/// bar and home indicator (capacitor.config.json); here swipes from the screen
/// edges need a second swipe, so steering near an edge never leaves the game.
class GameViewController: CAPBridgeViewController {
    override var preferredScreenEdgesDeferringSystemGestures: UIRectEdge { .all }

    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(GameCenterPlugin())
        // QA / CI hook: launched with SYNTHWING_DEMO=1, the game starts its
        // self-playing attract demo right away. Players never set this.
        if ProcessInfo.processInfo.environment["SYNTHWING_DEMO"] == "1" {
            let flag = WKUserScript(source: "window.SYNTHWING_DEMO = true;", injectionTime: .atDocumentStart, forMainFrameOnly: true)
            webView?.configuration.userContentController.addUserScript(flag)
        }
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        let ink = UIColor(red: 5 / 255, green: 4 / 255, blue: 12 / 255, alpha: 1)
        view.backgroundColor = ink
        webView?.isOpaque = true
        webView?.backgroundColor = ink
        webView?.scrollView.backgroundColor = ink
        webView?.scrollView.bounces = false
        webView?.scrollView.contentInsetAdjustmentBehavior = .never
    }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        setNeedsUpdateOfHomeIndicatorAutoHidden()
        setNeedsUpdateOfScreenEdgesDeferringSystemGestures()
    }
}
