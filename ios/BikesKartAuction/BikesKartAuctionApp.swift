import SwiftUI
import UIKit
import WebKit

@main
struct BikesKartAuctionApp: App {
    var body: some Scene {
        WindowGroup { AuctionScreen().preferredColorScheme(.light) }
    }
}

struct AuctionScreen: View {
    @StateObject private var browser = AuctionBrowser()
    @State private var confirmReload = false

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                if browser.loading { ProgressView().accessibilityLabel("Loading auction page") }
                if let message = browser.errorMessage {
                    VStack(spacing: 16) {
                        Image(systemName: "wifi.exclamationmark").font(.largeTitle)
                        Text(message).multilineTextAlignment(.center)
                        Button("Try again") { browser.reload() }.buttonStyle(.borderedProminent)
                    }.padding().frame(maxWidth: .infinity, maxHeight: .infinity)
                }
                AuctionWebView(browser: browser).frame(height: browser.errorMessage == nil ? nil : 0)
            }
            .navigationTitle("BikesKart Auction")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItemGroup(placement: .bottomBar) {
                    Button { browser.webView.goBack() } label: { Image(systemName: "chevron.left") }
                        .disabled(!browser.canGoBack).accessibilityLabel("Back")
                    Spacer()
                    Button { confirmReload = true } label: { Image(systemName: "arrow.clockwise") }
                        .accessibilityLabel("Reload auction page")
                    Spacer()
                    Menu {
                        Button {
                            browser.shareItems = SharedItems(items: [AuctionBrowser.home])
                        } label: { Label("Share BikesKart", systemImage: "square.and.arrow.up") }
                        Button {
                            UIApplication.shared.open(URL(string: "https://apps.apple.com/account/updates")!)
                        } label: { Label("Open iPhone app updates", systemImage: "arrow.up.circle") }
                    } label: { Image(systemName: "ellipsis.circle") }
                    .accessibilityLabel("App menu")
                }
            }
            .confirmationDialog("Reload this page? Any unsent bid or form entries will be cleared.", isPresented: $confirmReload, titleVisibility: .visible) {
                Button("Reload") { browser.reload() }
                Button("Cancel", role: .cancel) {}
            }
            .sheet(item: $browser.shareItems) { item in ShareSheet(items: item.items) }
        }
        .tint(Color(red: 0.05, green: 0.23, blue: 0.48))
    }
}

struct AuctionWebView: UIViewRepresentable {
    let browser: AuctionBrowser
    func makeUIView(context: Context) -> WKWebView { browser.webView }
    func updateUIView(_ uiView: WKWebView, context: Context) {}
}

struct SharedItems: Identifiable {
    let id = UUID()
    let items: [Any]
}

struct ShareSheet: UIViewControllerRepresentable {
    let items: [Any]
    func makeUIViewController(context: Context) -> UIActivityViewController {
        UIActivityViewController(activityItems: items, applicationActivities: nil)
    }
    func updateUIViewController(_ controller: UIActivityViewController, context: Context) {}
}
