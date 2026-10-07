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

1. Install Android APK version 1.2-test over the previous APK. Allow notifications and log in as an approved, active dealer. The server must be deployed before the device can register.
2. Schedule a short test auction a few minutes ahead. Lock the dealer phone before the start time.
3. At the scheduled start, confirm the phone receives a notification. Tap it and confirm the correct lot opens. Also test an alert while the app is open.
4. Reopen the app after changing Android notification permission. It removes the device registration when notifications are disabled. Explicit dealer logout also unregisters the device.
5. Confirm disabled/unapproved dealer accounts do not receive new deliveries. Closed, cancelled, and future auctions must not send.

Delivery records are unique per auction and device. New re-auctions receive a new auction ID, so they can produce a new alert while keeping earlier bids intact. Invalid tokens are removed; temporary failures retry with backoff up to eight attempts, and expired auctions stop retrying. A process crash between an FCM send and recording success can cause a repeat delivery; the Android notification uses the lot ID to replace the existing alert. Android power restrictions, offline phones and force-stop can delay or prevent delivery. No end-to-end delivery has been verified until the private server credentials and a physical device test are complete.

On first enablement, already-live auctions may produce one alert per registered device; future scheduled auctions notify only after their start. Active approved dealers who register during a live auction may also receive its current-live alert. Devices not reopened for 90 days are excluded from new alerts.

## Build Android

Use JDK 17, Gradle 8.11.1, Android SDK platform 35 and accepted SDK licenses. Put the downloaded client `google-services.json` in `android/app/` (ignored by Git).

The test build needs a private signing keystore with alias `androiddebugkey` and Android's standard test passwords. For updates, reuse the same original keystore; do not commit it. Set `BK_SIGNING_KEY` to its absolute path, then run `gradle -p android :app:assembleDebug`. Production distribution needs a separate release signing process. The APK currently loads the existing HTTPS auction website in a WebView and uses native Firebase Messaging for alerts. No JavaScript interface exposing native methods is installed; device registration uses an origin-checked native event and the dealer's existing authenticated API session.
