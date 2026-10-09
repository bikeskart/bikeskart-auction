# Android auction-start notifications

Android package: `com.bikeskart.auction`. Firebase project: `bikeskart-auction`.

## Deploy the server

Merge this pull request and redeploy the Node application on Hostinger. No new Node dependency is needed. The worker creates its two notification tables automatically using the existing MySQL connection. It runs every five seconds and only sends for auctions inside their live UTC window. It does not change auction results, admin approval, bids, or sold status.

## Private Firebase server credentials

In Firebase Console, open Project settings > Service accounts > Firebase Admin SDK > Generate new private key. Use a service account belonging to the same `bikeskart-auction` project. Keep this JSON private: never add it to GitHub, an APK, the website uploads directory, or public_html.

Configure these Node application environment variables in Hostinger:

- `FIREBASE_PROJECT_ID=bikeskart-auction`
- Exactly one of `FIREBASE_SERVICE_ACCOUNT_PATH` (absolute path to the private service-account JSON outside public directories) or `FIREBASE_SERVICE_ACCOUNT_BASE64` (the base64-encoded complete JSON, set as a private environment variable).

Redeploy/restart the application after adding the environment variables. Ensure Firebase Cloud Messaging API (HTTP v1) is enabled for the project and the service account has permission to send FCM messages. Android's `google-services.json` is client configuration and is not the server credential.

The server uses the official FCM HTTP v1 API with an OAuth access token minted using the service account. Credentials are read only server-side and are never returned to the phone. When credentials are absent, auctions continue working and server logs state that push is disabled.

## Install and test

1. Install Android APK version 1.3-test with the approved grey, white and lime BK icon. This test build uses a new signing key because the previous temporary test key is unavailable, so uninstall the earlier test APK first, then install and log in again. Allow notifications and log in as an approved, active dealer. The server must be deployed before the device can register.
2. Schedule a short test auction a few minutes ahead. Lock the dealer phone before the start time.
3. At the scheduled start, confirm the phone receives a notification. Tap it and confirm the correct lot opens. Also test an alert while the app is open.
4. Reopen the app after changing Android notification permission. It removes the device registration when notifications are disabled. Explicit dealer logout also unregisters the device.
5. Confirm disabled/unapproved dealer accounts do not receive new deliveries. Closed, cancelled, and future auctions must not send.

Delivery records are unique per auction and device. New re-auctions receive a new auction ID, so they can produce a new alert while keeping earlier bids intact. Invalid tokens are removed; temporary failures retry with backoff up to eight attempts, and expired auctions stop retrying. A process crash between an FCM send and recording success can cause a repeat delivery; the Android notification uses the lot ID to replace the existing alert. Android power restrictions, offline phones and force-stop can delay or prevent delivery. No end-to-end delivery has been verified until the private server credentials and a physical device test are complete.

On first enablement, already-live auctions may produce one alert per registered device; future scheduled auctions notify only after their start. Active approved dealers who register during a live auction may also receive its current-live alert. Devices not reopened for 90 days are excluded from new alerts.

## Build Android

Use JDK 17, Gradle 8.11.1, Android SDK platform 35 and accepted SDK licenses. Put the downloaded client `google-services.json` in `android/app/` (ignored by Git).

The test build needs a private signing keystore with alias `androiddebugkey` and Android's standard test passwords. For updates, reuse the same original keystore; do not commit it. Set `BK_SIGNING_KEY` to its absolute path, then run `gradle -p android :app:assembleDebug`. Production distribution needs a separate release signing process. The APK currently loads the existing HTTPS auction website in a WebView and uses native Firebase Messaging for alerts. No JavaScript interface exposing native methods is installed; device registration uses an origin-checked native event and the dealer's existing authenticated API session.


## Dealer registration approval alerts

Pending dealers can now register their phone before logging in. Registration and a password-verified pending login return a scoped, expiring push credential; this cannot access auctions or approve accounts. The Android web page stores it so device-token and permission changes can be synced while approval is pending. Existing pending dealers should open the app and attempt login once to enable approval alerts.

Admin approval commits a durable event in the same database transaction as the account change. The existing five-second worker sends “Registration approved” to the dealer's registered devices, retries temporary failures and removes invalid device tokens. Repeated saves do not create another approval event. Events are eligible for seven days, giving devices time to reconnect. The additional tables are created automatically.

Deploy the updated Node server and auction.js. The current Android messaging service already displays the supplied title and body, so this feature needs no APK change if the installed APK includes Firebase Messaging. Firebase server credentials and Android notification permission remain required. A tap opens the app where the approved dealer can log in. Test a new pending registration with notifications enabled, close the app, approve from admin, then confirm the phone receives the alert and can log in.


## Outbid alerts

When a new accepted bid replaces a different leading dealer, an outbid event is committed in the bid transaction. Self-raises, rejected bids and idempotent bid retries do not create events. The worker sends “You have been outbid” to the previous leader, with the lot ID so tapping opens that lot. Retries stop for ended lots or a dealer who has regained the lead. This is a live outbid alert; final auction-loss alerts are not included. Firebase credentials and enabled registered devices are required.

## Dropdown app updates

The dealer dropdown always contains Update app. Set these private server environment variables after hosting a signed APK at a direct HTTPS download URL:

- `APP_UPDATE_APK_URL`: direct HTTPS download link for the actual APK
- `APP_UPDATE_VERSION_CODE`: the hosted APK's integer Android versionCode
- `APP_UPDATE_VERSION_NAME`: the hosted APK's display version

Restart the server after changing settings. No APK release or download URL is fabricated. Without a configured download/version, clicking the menu reports that no update is available yet. New builds publish their installed version to the page, allowing the button to identify an available update or report that the app is current. Older APKs without version metadata can still use the download button.

The Android source adds browser handling for APK links/downloads and version metadata. These native changes require a rebuilt APK. Host the APK externally for compatibility with previously installed WebViews that lack same-origin download handling. To install over an existing app, retain the same package name and original signing key and increase versionCode. Android asks the dealer to confirm installation and may request permission for the browser to install downloaded apps. This is a download/install flow, not silent automatic installation. This environment has no Android SDK, signing key or Firebase client file, so a rebuilt APK and physical device update test remain required.
