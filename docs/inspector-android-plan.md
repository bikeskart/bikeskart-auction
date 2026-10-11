# BikesKart Inspector Android — implementation plan

Status: initial implementation specification; APK not yet built.

## Architecture
Separate Android application, integrated with existing Express/MySQL BikesKart Auction API. Do not alter live bidding or auction closing flows.

## Inspector screens
1. Login (inspector-only authentication).
2. Assigned inspections and sync status.
3. Vehicle identification and RC details.
4. Guided photo/video capture.
5. Mechanical and document checklist.
6. Review and submit; correction requests.

## Existing Add Bike field mapping
Core: brand, model, year, registrationNumber, kilometersDriven, ownershipCount, fuelType, conditionNotes.
Profile: engineNumber, chassisNumber, registrationDate, registrationYear, inspectionNotes, hpStatus, nocStatus, rcAvailable, keysCount, insuranceStatus, engineNoise, smoke, selfStart, clutchPlate, timingChainNoise, engineCondition, batteryWorking, chassis, bodyLine.

Preserve existing field names and enum values by checking admin.html and backend validators before implementing submissions.

## Media
Required: front/rear/left/right, odometer, front/rear tyres, engine/chassis identification, RC both sides, engine-start and walkaround videos.
Keep RC images and owner/contact details private to authorized staff.
Persist drafts locally, queue uploads with idempotency keys, verify checksums, retry safely on connectivity restoration, and remove local sensitive media after server confirmation under a defined retention policy.

## Integration and security
New inspector-specific authentication/authorization and assignment-scoped API.
Inspection draft -> submitted -> approved/changes requested.
Approval creates or updates a linked bike inventory draft once, never automatically publishes an auction.
Admin chooses bike from inventory and controls starting price, reserve price, scheduling, and publishing.
Use private object storage for media and short-lived signed access URLs; enforce file type, size, and malware checks.

## Delivery
- Phase 1: verify backend bike creation validators, schema and auth.
- Phase 2: implement additive inspection tables, APIs and tests.
- Phase 3: create Android app screens and offline storage.
- Phase 4: implement media capture, background sync and approval.
- Phase 5: build signed test APK, test on real Android devices and validate auction draft mapping.

No production deployment without review and tests.
