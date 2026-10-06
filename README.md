# BikesKart Auction — Stage 1

Stage 1 adds secure authentication to the existing BikesKart Auction landing page.

## Production configuration

Hostinger already provides the database environment variables and `JWT_SECRET`.
This package accepts the existing `JWT_SECRET`; separate JWT access/refresh secrets
can be added later without changing the application code.

Production CORS is configured for:
`https://auction.bikeskart.com`

The existing `bikeskart.com` website is not modified by this project.

## Stage 1 API

- POST `/api/auth/register`
- POST `/api/auth/login`
- POST `/api/auth/refresh`
- POST `/api/auth/logout`
- GET `/api/auth/me`
- GET `/api/admin/ping`
- GET `/health`
- GET `/health/db`

Admins are created separately with:
`node scripts/createAdmin.js "Full Name" "email@example.com" "Password123"`

Do not upload `.env` or any secret values to GitHub.

## Security and session fixes

Only the five public frontend files are served from the project root. Bike photos
remain public; RC documents are opened through the authenticated admin endpoint
`GET /api/admin/bikes/:id/rc`. Ensure Hostinger does not separately expose the
project root or `/uploads/rc` through its web-server static configuration.

Admin requests refresh expired access tokens and retry once. Tokens now have
explicit access/refresh types and unique refresh IDs; existing sessions require
one fresh login after deploying this update. Successfully loaded bike details
clear selected upload inputs to prevent submitting the same files again.

The reference schema includes bikes and bike_images. Do not run it against the
existing production database without comparing its current structure first.

Run regression checks with `npm test`. These use a stub database and do not
connect to or change production data.

## Auction engine (Stage 2)

Approved, active dealer/bidder accounts can view timed lots and place binding bids.
Admin accounts schedule auctions and approve or disable dealer accounts. An auction
uses whole Indian rupees, a starting price, minimum increase, and optional reserve
(defaults to its starting price). Highest bid wins only when the reserve is met.
No bids or reserve not met means no winner. Auctions with bids cannot be cancelled.
A bike with an active auction or a winning auction cannot be scheduled again.
Payment collection and vehicle handover are handled manually by BikesKart.

### One-time database setup

After merging/deploying, run `npm run db:migrate:auctions` from the project directory
on Hostinger with the existing `.env`, then restart/redeploy the Node app. Review
`database/migrations/002_auctions.sql` first and take a database backup. This adds
only `auctions` and `auction_bids`; it does not recreate or modify existing tables.
The command matches foreign-key ID types to the existing bikes/users tables. When
applying SQL manually, match those ID types yourself. Requires InnoDB and support for stored generated
columns. Existing bikes, bike_images and users
tables must already exist. CREATE TABLE requires database DDL privileges. DDL is
not transactional; a failed partial install can be rerun with the same command.

Until the tables are installed, existing bike management still works and auction
requests return an unavailable message. No migrations run automatically at startup.

### Operation

1. A dealer registers on the auction home page and waits for approval.
2. Admin opens **Dealer Accounts** and approves the account after verification.
3. Add a bike, then use its ID under **Schedule an auction**. Device-local dates
   are submitted with a timezone and stored in UTC.
4. Dealers log in, inspect the lot and bid. The displayed timer follows server
   time; bid acceptance is enforced using the database clock after row locking.
5. Closing runs every five seconds while the server is running, and on listing or
   opening auctions. After a restart, overdue lots close on the next sweep/read.
   Bidding stops at the exact end even if the background sweep has not run.
6. Admin sees the winning dealer's name/email and arranges payment and handover.
   Account disablement blocks new bids immediately; prior bids remain binding.

Bid writes and closing lock the auction row in a transaction. A unique bid request
ID makes retrying a request safe, and a unique generated index prevents duplicate
active auctions on a bike. Dealer responses omit reserve and other bidder/winner
identities. The interface polls every five seconds; it does not use WebSockets.
Lists are paginated in batches of 50. Prices accept integer rupees up to ₹1 billion.

`npm test` covers security, API permissions, bid conflicts, replay protection,
deadlines, reserves and closing using simulated database connections. Run the
migration and a full auction on a staging database before production bidding.
