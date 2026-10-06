# BikesKart admin operations

## Deployment

Merge and allow Hostinger to deploy. **admin@bikeskart.com** is the only main admin. Other admin accounts require explicit approved staff scopes. The first authenticated admin request adds `users.admin_scopes`, `admin_activity` and `auction_confirmations` using additive schema changes. Existing inventory requires the nullable `bikes.sale_profile` column added by the inventory feature. The application database user needs CREATE and ALTER permissions. Auction migrations must already be applied.

The administrator page loads `admin-ops.js`; only the explicitly allowed frontend files are public. Restarting the deployed app starts the backup scheduler. Check **Backups** after deployment to verify that an archive was created on Hostinger. Automated tests use fixtures; the production database has not been tested.

## Daily work

- **Payments:** save the actual sale price, received total, method, payment date/reference, buyer contact and due date. Starting/winning prices are not payment receipts. Balances and Pending/Part-paid/Paid derive from stored amounts; paise are used for calculations. Confirm full payment explicitly before handover. Changes to payment details reset that confirmation.
- **Delivery:** record collector name/mobile, delivery date, handover notes and confirm that the receipt is signed. Upload delivery photos and sale receipts in Bike Inventory → View / Edit. Release requires a positive sale price or winning amount, full received payment, admin payment confirmation, collector, date, delivery photo and receipt. The app checks the presence of uploaded documents and an admin attestation; it does not inspect signatures or certify legal validity. Existing documents are retained.
- **Documents:** RC, NOC, hypothecation clearance and ownership transfer have separate states and an optional deadline. Dashboard overdue reminders do not contact dealers automatically.
- **Costs & Profit:** purchase price, transport, repair, document and other expenses. Profit requires a purchase price and sale/winning price. Unentered expenses count as zero; financial summaries label incomplete purchase costs.
- **Auction Controls:** live/upcoming/closed lists, reserve outcomes, paginated bidder history, explicit winner confirmation. Confirmation records a business acknowledgement; it never selects a different winner, overrides a bid, releases a bike or sends a message. Existing cancellation requires no bids and an auction that has not ended.
- **Dealer Approvals:** approve/suspend/reactivate and view the latest 50 winning purchases with payments and deliveries. Full bike records remain in the Excel report.
- **Reports:** stock, sold/winning bikes, outstanding payments, pending deliveries, monthly recorded profit and dashboard overdue reminders. Excel contains all saved inventory rows. There is no automatic email or WhatsApp delivery.
- **Activity History:** actor and time for bike updates (before/after), operations changes (before/after), bulk imports, dealer access, auction creation/cancellation/confirmation, staff changes and manual notification actions. Operation, staff, confirmation and bulk-import audits are written in the same transaction as their changes; legacy bike/auction/account/notification endpoints write audit immediately after their existing mutation. An audit write failure on these legacy routes can return an error after the mutation has succeeded, so check the resulting record before retrying. No passwords are included in activity records.

## Staff access

The main admin approves personal-email registration requests or creates staff logins with inventory, auctions and/or winner-notification access. Accounts and payment access cannot be granted to staff. Staff remain `admin` for compatibility, but server middleware loads their current database scopes on every protected request. Disabling a staff account takes effect even with an unexpired access token. Inventory staff cannot alter buyer/payment fields. Payments, costs, delivery, document operations, reports and dealer account controls stay with the main admin. Inventory responses omit private sale, payment and legal-document records for staff. Owners alone access activity history, staff management and backups. The main admin account cannot be disabled or reduced through the staff UI, and users cannot change their own access.

## Backup operation and recovery

Backups include every database base table (DDL plus JSON rows), public bike uploads and private RC/delivery/receipt files. Archives use private permissions outside uploads, with the latest 14 archives retained. Backup requests within one app process share a running job. Database rows use a repeatable-read consistent snapshot (InnoDB); uploads are copied afterwards, so files uploaded during the snapshot may also appear in the archive. Historical files are retained, so references to earlier documents remain available. This does not provide a strict instantaneous snapshot across both storage systems.

The app checks hourly and runs a backup once the newest archive is at least 24 hours old, including after a restart. Scheduling requires the app to be running, writable private storage and the `tar` utility. Default Hostinger storage is `hbuilds/private-backups`, beside the shared `uploads` folder. Optional `BACKUP_ROOT` must point outside upload/public folders. Check errors in the Backups tab and hosting logs. Local backups alone do not protect against hosting-account loss: download copies regularly to separate secure storage. Off-site storage is not configured by this change.

A manual CLI backup is also available:

```bash
node scripts/backupAdmin.js
```

For a hosting cron job, run that command with the actual Node binary, working directory and production environment used by the app. The built-in scheduler requires no cron configuration. Do not run multiple concurrent external cron backups; coordination across separate app processes is not provided.

For recovery, extract a trusted archive into a private directory. Create a different, empty database and set `RESTORE_DB_NAME` to its name. With the normal database connection environment loaded:

```bash
RESTORE_DB_NAME=your_empty_restore_database node scripts/restoreAdminBackup.js /private/extracted-backup
```

The restore script refuses a populated database or the configured live DB_NAME. It restores table definitions and rows into the empty database; failure can leave a partial restore, which must be discarded before retrying. Uploaded files remain in the extracted `uploads` directory. Compare row counts and files, test logins, payments and document downloads, then perform a planned application/database/upload switch. The restore script does not change production settings or overwrite live uploads. Store archives securely because they include account hashes, contact data and documents.

## Personal-email admin registration

On /admin.html, open **Register for admin access** and submit name, personal email, mobile and password. The request creates an inactive, unverified admin with no scopes. Permission fields in public registration are rejected. admin@bikeskart.com is reserved for the existing main admin account. The main admin opens **Staff Access**, selects inventory/auctions/notifications and **Approve & assign access**. Approval activates the account when Active is checked. Staff cannot approve peers, view accounting/payments/profit/reports, or assign permissions. Access is checked against current database state on every request, including direct API calls.
