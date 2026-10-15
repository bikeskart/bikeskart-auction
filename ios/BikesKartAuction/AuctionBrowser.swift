import SwiftUI
import WebKit

/// Uses the same HTTPS origin and persistent cookies as the dealer website.
/// Session expiry and logout remain controlled by the server.
final class AuctionBrowser: NSObject, ObservableObject, WKNavigationDelegate, WKUIDelegate, WKDownloadDelegate {
    static let home = URL(string: "https://auction.bikeskart.com")!
    @Published var loading = true
    @Published var canGoBack = false
    @Published var errorMessage: String?
    @Published var shareItems: SharedItems?
    let webView: WKWebView
    private var observations: [NSKeyValueObservation] = []
    private var downloads: [ObjectIdentifier: URL] = [:]

    override init() {
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .default()
        // Run before website scripts so the APK-only menu is never offered on iOS.
        configuration.userContentController.addUserScript(WKUserScript(source: """
          window.BKAppPlatform = 'ios';
          document.addEventListener('DOMContentLoaded', function () {
            var button = document.getElementById('updateApp');
            if (button) button.hidden = true;
            var message = document.getElementById('updateAppMsg');
            if (message) message.hidden = true;
          });
          """, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        webView = WKWebView(frame: .zero, configuration: configuration)
        super.init()
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.allowsBackForwardNavigationGestures = true
        observations = [
            webView.observe(\.isLoading, options: [.new]) { [weak self] view, _ in
                DispatchQueue.main.async { self?.loading = view.isLoading }
            },
            webView.observe(\.canGoBack, options: [.new]) { [weak self] view, _ in
                DispatchQueue.main.async { self?.canGoBack = view.canGoBack }
            }
        ]
        webView.load(URLRequest(url: Self.home))
    }

    func reload() {
        errorMessage = nil
        if webView.url == nil { webView.load(URLRequest(url: Self.home)) }
        else { webView.reload() }
    }

    private func allowed(_ url: URL) -> Bool {
        url.scheme == "https" && url.host == Self.home.host && url.user == nil && url.password == nil
    }

    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = action.request.url else { decisionHandler(.cancel); return }
        if url.pathExtension.lowercased() == "apk" {
            errorMessage = "Android updates cannot be installed on iPhone. Use App Store updates from the app menu."
            decisionHandler(.cancel); return
        }
        if allowed(url) || url.scheme == "blob" {
            if action.shouldPerformDownload { decisionHandler(.download) }
            else {
                decisionHandler(.allow)
                if action.targetFrame == nil { webView.load(action.request) }
            }
            return
        }
        decisionHandler(.cancel)
        // External links leave the authenticated web view. Never open arbitrary schemes.
        if action.targetFrame?.isMainFrame != false && ["https", "tel", "mailto"].contains(url.scheme ?? "") {
            UIApplication.shared.open(url)
        }
    }

    func webView(_ webView: WKWebView, decidePolicyFor response: WKNavigationResponse,
                 decisionHandler: @escaping (WKNavigationResponsePolicy) -> Void) {
        let disposition = (response.response as? HTTPURLResponse)?.value(forHTTPHeaderField: "Content-Disposition") ?? ""
        if !response.canShowMIMEType || disposition.lowercased().contains("attachment") {
            decisionHandler(.download)
        } else { decisionHandler(.allow) }
    }

    func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) { errorMessage = nil }
    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) { failed(error) }
    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) { failed(error) }
    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        errorMessage = "The auction page stopped. Reload to reconnect and verify your latest bid."
    }
    private func failed(_ error: Error) {
        guard (error as NSError).code != NSURLErrorCancelled else { return }
        loading = false
        errorMessage = "Unable to load BikesKart. Check your connection and try again. Verify bid status before submitting again."
    }

    func webView(_ webView: WKWebView, navigationAction: WKNavigationAction, didBecome download: WKDownload) { download.delegate = self }
    func webView(_ webView: WKWebView, navigationResponse: WKNavigationResponse, didBecome download: WKDownload) { download.delegate = self }
    func download(_ download: WKDownload, decideDestinationUsing response: URLResponse, suggestedFilename: String,
                  completionHandler: @escaping (URL?) -> Void) {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
        do {
            try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
            let name = (suggestedFilename as NSString).lastPathComponent
            let destination = directory.appendingPathComponent(name.isEmpty ? "BikesKart-document" : name)
            downloads[ObjectIdentifier(download)] = destination
            completionHandler(destination)
        } catch { completionHandler(nil); errorMessage = "Unable to save this document. Please try again." }
    }
    func downloadDidFinish(_ download: WKDownload) {
        if let url = downloads.removeValue(forKey: ObjectIdentifier(download)) {
            shareItems = SharedItems(items: [url])
        }
    }
    func download(_ download: WKDownload, didFailWithError error: Error, resumeData: Data?) {
        if let url = downloads.removeValue(forKey: ObjectIdentifier(download)) {
            try? FileManager.default.removeItem(at: url.deletingLastPathComponent())
        }
        errorMessage = "The document download failed. Please try again."
    }

    private func present(_ alert: UIAlertController, otherwise: () -> Void) {
        guard let scene = webView.window?.windowScene,
              var controller = scene.windows.first(where: { $0.isKeyWindow })?.rootViewController else { otherwise(); return }
        while let next = controller.presentedViewController { controller = next }
        guard !controller.isBeingDismissed else { otherwise(); return }
        controller.present(alert, animated: true)
    }
    func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping () -> Void) {
        let alert = UIAlertController(title: "BikesKart", message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "OK", style: .default) { _ in completionHandler() })
        present(alert, otherwise: completionHandler)
    }
    func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) {
        let alert = UIAlertController(title: "BikesKart", message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "Cancel", style: .cancel) { _ in completionHandler(false) })
        alert.addAction(UIAlertAction(title: "Confirm", style: .default) { _ in completionHandler(true) })
        present(alert, otherwise: { completionHandler(false) })
    }
    func webView(_ webView: WKWebView, runJavaScriptTextInputPanelWithPrompt prompt: String, defaultText: String?,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (String?) -> Void) {
        let alert = UIAlertController(title: "BikesKart", message: prompt, preferredStyle: .alert)
        alert.addTextField { $0.text = defaultText }
        alert.addAction(UIAlertAction(title: "Cancel", style: .cancel) { _ in completionHandler(nil) })
        alert.addAction(UIAlertAction(title: "OK", style: .default) { _ in completionHandler(alert.textFields?.first?.text) })
        present(alert, otherwise: { completionHandler(nil) })
    }
}
