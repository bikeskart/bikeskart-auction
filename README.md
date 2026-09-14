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
