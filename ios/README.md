# BikesKart Auction for iPhone

First iOS client for the existing https://auction.bikeskart.com dealer service.
Uses SwiftUI and WKWebView with persistent website data, native back navigation,
reload confirmation, connection recovery, native JavaScript confirmation dialogs,
and authenticated document downloads with the iOS share sheet. Standard HTML file
inputs use the iOS file/photo picker. The Android APK update menu is hidden; iOS
updates are reached through the native app menu. No production web files change.

## Build from your Android phone

Open the pull request's **Checks** tab to see the automatic macOS simulator build.
After merging, GitHub → Actions → **iPhone simulator build** → **Run workflow** can
run it again. The artifact is a simulator app, NOT an installable iPhone IPA.
A successful build checks compilation, not real-device behavior or Apple approval.

## On a Mac or hosted macOS runner

```
brew install xcodegen
cd ios
python3 prepare_assets.py
xcodegen generate
open BikesKartAuction.xcodeproj
```

Choose a simulator and Run. The build uses the existing Android brand icon,
converted to an opaque 1024px App Store icon by macOS `sips`.

## Signing and TestFlight (requires your Apple account)

1. Enroll in the Apple Developer Program with your legal identity.
2. In App Store Connect create BikesKart Auction. The proposed bundle ID is
   `com.bikeskart.auction.ios`; confirm it is available and register it first.
3. In Xcode Signing & Capabilities select your Apple development team. Do not
   post passwords, signing keys or certificates in source or chat.
4. Select Any iOS Device, Product → Archive, then Distribute App → App Store Connect.
   A hosted Mac can do the same with securely stored signing credentials.
5. Invite an iPhone tester in TestFlight. Only a signed uploaded build can be
   installed through TestFlight. The simulator artifact cannot be installed on a phone.

## Required before App Store release

- Test login, expired session recovery, logout and relaunch. Cookies persist, but
  server expiry still applies; indefinite login is not promised.
- Test registration, document/photo selection, live bidding, bid confirmations,
  auction ending, wins, invoices, loss of connection and reconnect on a real iPhone.
  Never use production bids as test data; use a dedicated test dealer and test lots.
- Push notifications are NOT implemented in this first version. Android currently
  uses Firebase data messages with Android delivery options. iOS requires Firebase
  iOS registration/APNs credentials, notification permission handling, device-token
  bridging and APNs alert payload support on the server. Do not advertise alerts yet.
- Review account deletion inside the app if users can create accounts, privacy
  policy, support URL, App Privacy answers, age rating, screenshots and review login.
- Add meaningful app-specific functionality and review Apple's minimum functionality
  guideline 4.2. This web-based first version does not guarantee App Store acceptance.
- Confirm all uploaded files/downloads, camera capture and any inspection video
  capture on hardware. Permissions are declared but hardware behavior is unverified.

References:
- https://developer.apple.com/programs/enroll/
- https://developer.apple.com/app-store/review/guidelines/
- https://developer.apple.com/testflight/
- https://developer.apple.com/documentation/webkit/wkwebsitedatastore
