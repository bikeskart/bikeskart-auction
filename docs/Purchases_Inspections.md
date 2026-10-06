# Purchases and executive inspections

The main admin (admin@bikeskart.com) uses the Purchases & Inspection Records tab for the purchase date, seller/customer mobile and KYC, bike details, location, purchase price, expenses, outgoing payments and receipts. Executives are created and enabled/disabled in the separate Executives tab. Other admins do not have access to purchase accounting or these private source records.

1. Create an executive account with their personal email and a password of at least 12 characters.
2. In Purchases & Inspection Records, choose Assign new inspection. Enter only the vehicle registration number, customer mobile, Bengaluru zone (North, East, West, South or Central), and executive. The record and assignment are saved together. No customer name, purchase price or vehicle specifications are required at assignment. The executive completes those inspection details; purchase accounting remains with the main admin.
3. The executive signs in at `/executive.html` (also `/executive`) and opens their assigned inspection. Record the vehicle, inspection checklist, actual inspection date/time, address and optionally current GPS coordinates.
4. Save the inspection. Open the application camera, allow camera permission, and capture bike photos. Upload customer KYC and RC/NOC documents separately. Bike photos use a live camera preview rather than a gallery picker; up to 30 photos per inspection, with each upload limited to 8 MB.
5. Submit for main-admin review. Submitted inspections are locked for executives; the main admin can return them by assigning them again before inventory approval.
6. The main admin reviews the inspection and forwards it to inventory. This creates one draft bike with the inspection fields and photos. Retry requests return the existing bike instead of duplicating it. The admin then creates the auction through the existing Create Auction tab.

Purchase payments are amounts paid to the seller, separate from sale payments received from the buyer. Subsequent changes to purchase price and expenses update the inventory cost record while preserving buyer payments. The original purchase/inspection is linked from the main admin's bike detail view, including inspector and inspection date. Vehicle changes after handoff are made through Bike Inventory.

Inspection photos and KYC/vehicle documents initially live in the private persistent `uploads/inspections` folder, accessible only through authenticated, assignment-scoped API requests. Forwarding copies bike photos to inventory's public bike-photo folder and the latest RC to private RC storage. KYC and purchase receipts stay private. Existing admin backups include the new database tables and upload folder.

The application creates the two purchase tables when first used and adds `executive` to a legacy users.role enum if necessary. It does not remove existing roles or records. The database account needs the same schema permissions as the existing migration features.

Camera capture requires HTTPS and browser permission. Camera integration has been verified with a mocked browser stream; actual Android/iPhone camera behavior still needs a device check after deployment. Capture timestamps and the camera-source label are recorded, but browser-origin metadata is not cryptographic proof of a photo's authenticity.

No notifications are sent automatically by this workflow.
