# BikesKart WhatsApp notifications

## Triggers

| Message | Trigger | Recipient |
| --- | --- | --- |
| New bike auction | An auction is published with a future start time | Active approved dealers who enabled auction alerts |
| Auction starts | The auction enters its live UTC window | Active approved dealers who enabled auction alerts |
| Winning buyer | Main admin confirms a closed winning auction with Mark sold | Confirmed winning dealer |
| Payment confirmation | Admin confirms full buyer payment | Confirmed winning dealer |
| Invoice PDF | Full payment is confirmed and a Buyer invoice PDF is uploaded | Confirmed winning dealer |
| Ready for pickup | Full payment is confirmed and admin sets Ready for buyer pickup with an address | Confirmed winning dealer |
| Delivery confirmation | Existing payment/evidence checks permit admin to complete release | Confirmed winning dealer |

Dealers opt in under Menu > WhatsApp alerts. Transactional updates and new-auction alerts have separate settings, both off by default. Preferences bind consent to the registered mobile number. A changed buyer or mobile number suppresses messages until the correct contact/consent is recorded. Incoming STOP, UNSUBSCRIBE or STOP ALL disables both preferences for the matching number. No existing phone contacts are subscribed automatically.

Pending/unconfirmed awards never send winner messages. Part-payments never trigger the full-payment invoice or pickup message. Internal seller pickup and buyer collection remain separate. Admin enters the buyer pickup address, an optional HTTPS map link, contact and instructions in Accounts & Delivery > Delivery. The invoice is the business-issued PDF uploaded in Bike Inventory > private sale documents; a signed sale receipt or RC is never relabeled as an invoice. This integration does not fabricate an invoice number, tax figures or invoice document.

## Connect Meta Cloud API

Use the BikesKart business number through the existing safe Coexistence/Cloud API onboarding. This code does not migrate, deregister or change the phone's WhatsApp Business app.

Configure private server environment variables, keeping credentials outside GitHub, APKs and public_html:

- `WHATSAPP_ENABLED=true` only after templates and webhook setup are ready.
- `WHATSAPP_PHONE_NUMBER_ID`: the Meta API phone-number ID, not the mobile number.
- `WHATSAPP_ACCESS_TOKEN`: a server-side access token authorized for the phone number.
- `WHATSAPP_GRAPH_VERSION`: a currently supported Graph API version in `vNN.0` format, chosen from the Meta dashboard/documentation.
- `WHATSAPP_APP_SECRET`: the Meta app secret used to validate signed POST webhooks.
- `WHATSAPP_WEBHOOK_VERIFY_TOKEN`: a private random value matching the webhook verification setup.
- `WHATSAPP_TEMPLATE_LANGUAGE`: the exact approved template language, default `en`.
- Each `WHATSAPP_TEMPLATE_*` variable from the table below: the exact approved template name in that WhatsApp Business Account.

Set the webhook callback to `https://auction.bikeskart.com/api/whatsapp/webhook`. Subscribe the WhatsApp Business Account to the app's messages webhook field. GET verifies the configured token; POST verifies HMAC-SHA256 over the raw JSON body before processing delivery/read/failure receipts or unsubscribe commands. Events for another phone-number ID are ignored.

The integration remains disabled when any required credential or template name is missing. Readiness reflects configured values, not proof of Meta approval or a successful delivery. Complete a physical-phone test before relying on notifications.

## Templates to create and approve

These are original suggested bodies with positional text parameters, in the exact order sent by the code. Match header type and language exactly. Final category/approval is determined by Meta; new-auction discovery normally belongs in Marketing, while purchase-specific confirmations generally fit Utility. Do not send a promotional auction template under a transactional-only opt-in.

| Environment variable | Suggested name | Header | Positional body parameters |
| --- | --- | --- | --- |
| WHATSAPP_TEMPLATE_NEW_AUCTION | bikeskart_new_auction | None | Bike, lot ID, start time in IST, lot URL |
| WHATSAPP_TEMPLATE_AUCTION_LIVE | bikeskart_auction_live | None | Bike, lot ID, lot URL |
| WHATSAPP_TEMPLATE_WINNER | bikeskart_winner | None | Buyer name, lot ID, bike, registration, winning amount, contact |
| WHATSAPP_TEMPLATE_PAYMENT | bikeskart_payment_received | None | Buyer name, lot ID, bike, total received, reference |
| WHATSAPP_TEMPLATE_INVOICE | bikeskart_invoice | Document (PDF) | Buyer name, lot ID, bike |
| WHATSAPP_TEMPLATE_PICKUP | bikeskart_pickup_ready | None | Buyer name, lot ID, bike, address, map link or directions note, contact, instructions |
| WHATSAPP_TEMPLATE_DELIVERED | bikeskart_delivered | None | Buyer name, lot ID, bike, delivery date, collector |

Suggested template bodies:

- New auction: `A new BikesKart auction is scheduled: {{1}}, Lot #{{2}}. Starts {{3}}. View the lot: {{4}}. Reply STOP to stop WhatsApp alerts.`
- Auction live: `BikesKart auction is live: {{1}}, Lot #{{2}}. View and bid: {{3}}. Reply STOP to stop WhatsApp alerts.`
- Winner: `Hello {{1}}, BikesKart has confirmed your winning bid for Lot #{{2}}. Bike: {{3}}, registration {{4}}. Winning amount: {{5}}. Contact {{6}} to arrange payment.`
- Payment: `Hello {{1}}, full payment for BikesKart Lot #{{2}}, {{3}}, is confirmed. Total received: {{4}}. Reference: {{5}}.`
- Invoice: `Hello {{1}}, your invoice for BikesKart Lot #{{2}}, {{3}}, is attached. Full payment has been confirmed.`
- Pickup: `Hello {{1}}, BikesKart Lot #{{2}}, {{3}}, is ready for pickup. Address: {{4}}. Directions: {{5}}. Contact: {{6}}. Instructions: {{7}}.`
- Delivered: `Hello {{1}}, delivery of BikesKart Lot #{{2}}, {{3}}, was completed on {{4}}. Collected by {{5}}.`

Provide a genuine sample PDF when approving the Document header template. The server uploads the invoice privately through the media API and attaches its media ID, so financial PDFs are not exposed through public download links. Invoice filenames are generated and validated, PDFs are limited to 8 MB, and the sender checks the PDF signature.

## Deployment and verification

Merge and deploy Node server, frontend/admin files and these utilities. No new npm dependency or APK change is needed for WhatsApp. MySQL notification/preference/receipt tables are created automatically, along with existing sale/admin schema helpers. Restart after environment changes.

The worker polls every ten seconds, with paged dealer/catalog discovery. It deduplicates each message by event, auction and dealer, rechecks current consent, winning buyer, payment and pickup state immediately before sending, and expires old pending messages. Newly enabled dealers do not receive retrospective winner or auction-start notices; payment/invoice messages require a sale record updated after their opt-in. Initial opt-in does not mass-import old transactions. Repeated normal saves do not resend the same event. Replacing an invoice with a new PDF creates a new invoice event.

Test with a consenting dealer and a small auction: new auction, live start, confirmed winner, part-payment (no full-payment invoice), full payment, uploaded PDF, pickup-ready address/map and completed delivery. Verify the actual message and attachment on that dealer's phone. In Reports & Settings > WhatsApp Notifications, accepted is API acceptance; sent, delivered and read require signed Meta receipts. Receipts are durable even if they arrive before the API response is saved. Out-of-order receipts do not downgrade a delivered/read message.

Definitive transient API failures retry with backoff, at most six attempts. A timeout or crash after a message may have been sent is marked uncertain and is not automatically resent; review before manually resolving it. Invalid templates, expired access tokens and permanent API errors are recorded as failed. Credentials, recipient phones and invoice contents are not returned by the admin status endpoint. Database records contain the private recipient number and must remain server-side.

Readiness and Node tests do not prove end-to-end delivery. Meta onboarding, template approval, account permissions, messaging limits, provider charges and the physical-phone tests remain external setup steps.

Official references:
- https://developers.facebook.com/documentation/business-messaging/whatsapp/messages/template-messages/
- https://developers.facebook.com/documentation/business-messaging/whatsapp/business-phone-numbers/media
- https://developers.facebook.com/documentation/business-messaging/whatsapp/getting-opt-in
- https://whatsappbusiness.com/policy/
