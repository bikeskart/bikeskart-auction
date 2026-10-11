# Inspector Android — Phase 1 integration

Implemented on feature/inspector-android:
- Additive MySQL migration: database/migrations/20261011_inspector_phase1.sql
- Isolated inspector API router: src/routes/inspectorRoutes.js
- Admin-only account creation and assignment
- Inspector login, /me, /assignments endpoints

## Server integration still required
Mount the new router in server.js immediately after the existing auth route:

```js
app.use("/api/inspector", require("./src/routes/inspectorRoutes"));
```

This integration is intentionally NOT yet applied to server.js. Do not deploy or run migration before reviewing production schema and backing up the database.

## Security follow-ups before release
- Check whether only primary admins (rather than delegated admin staff) should create inspector accounts; tighten requireAdminScope accordingly.
- Add explicit account deactivation, assignment reassignment and credential reset.
- Add tests for invalid logins, disabled accounts, duplicate assignment, role isolation and token expiry.
- Add per-request account-status checks to every future inspector endpoint.
- Do not reuse the dealer app's authentication storage.
