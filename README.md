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
