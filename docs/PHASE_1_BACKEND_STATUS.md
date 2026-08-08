# Phase 1 Security & Staff Web Status

Date: 2026-08-08  
Scope: `TASK-P1-001` through `TASK-P1-004`, plus `TASK-P1-006` and `TASK-P1-007`

## Implemented

- Staff login, persistent failure lockout, opaque access/refresh credentials, atomic single-use refresh rotation, self logout, and scoped session revocation.
- Salted scrypt password storage at `N=2^17, r=8, p=1`; only HMAC-SHA-256 token hashes are stored in PostgreSQL.
- Village, facility, Bidan staff, and area/mother assignment persistence bounded by `health_centers`.
- Central deny-by-default capability policy: Puskesmas is a strict Bidan superset; Super Admin has no routine health-data access.
- Server-side mother-scope repository for Puskesmas center scope and Bidan explicit mother/area assignments.
- Append-only audit repository with allowlisted, redacted metadata for authentication and organization security actions.
- Explicit initial-Puskesmas provisioner with confirmation phrase and no credential output.
- Shared idempotency/concurrency coordinator with keyed request fingerprint, safe resource replay, same-key conflict detection, and bounded serializable retry.
- Same-origin staff Web BFF with strict HttpOnly cookies, exact-origin mutation checks, automatic refresh rotation, and identity-only browser responses.
- Responsive login, session-expired/logged-out, forbidden, unavailable, and role-aware workspace states without client-cached domain truth.

## Local verification

- Full workspace: format, lint, strict typecheck, 70 tests, all production builds, secret scan, and dependency audit passed.
- API: 7 files / 21 tests, including generic login failure, persistent lockout, concurrent refresh replay, immediate revocation, role/scope negatives, and audit redaction.
- PostgreSQL 17: Phase 1 migration `up → down → up` passed while preserving the baseline.
- Database verifier: required schema, absence of raw-token columns, cross-center composite FK rejection, and SQLSTATE `55000` append-only audit rejection passed.
- Real API/database smoke: login, `/staff/me`, refresh rotation, old-token rejection, village/facility/Bidan/assignment CRUD path, Bidan `403`, disable-triggered session revocation, and logout passed.
- Real concurrency smoke: two simultaneous same-key mutations produced one execution and one resource replay; same-key/different-request reuse was rejected.
- Real Web smoke: safe login body, HttpOnly cookies, access-token recovery through refresh rotation, logout/revocation, and anonymous 401 passed.
- Browser QA: desktop and 390px mobile login/workspace/logout renders passed; workspace WCAG A/AA audit returned zero violations/incomplete findings.

## Security invariants

- Authentication and authorization remain separate; every protected request resolves current session and scope from the server database.
- Unknown, wrong-password, locked, disabled, and inactive-center login attempts share a generic credential error.
- Raw password/access/refresh credentials do not enter audit metadata or application logs.
- Organization writes and assignment targets cannot cross the actor's Puskesmas boundary.
- Browser JavaScript cannot read staff credentials; no local/session storage is used for staff authentication.

## Still pending in Phase 1

- `TASK-P1-005`: break-glass remains `PROPOSED`; Super Admin is denied by default.
- `TASK-P1-008`: owner decision and possible MFA implementation for Puskesmas/Super Admin.

Hosted CI evidence is added by the protected pull-request workflow before merge.
