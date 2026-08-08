# PRD: Staff Access

> **Feature ID:** FEAT-STAFF  
> **Version:** 1.0.0  
> **Status:** Review  
> **Priority:** P0  
> **Owner:** Product Owner + Security  
> **Dependencies:** DOC-SRS, DOC-PERMISSION  
> **Last Updated:** 2026-08-08

## 1. Overview
Authentication/session untuk `BIDAN`, `PUSKESMAS`, dan optional `SUPER_ADMIN`.

## 2. Goals
Revocable sessions, least privilege, scope enforcement di backend.

## 3. Non-Goals
Tidak menggunakan role generik `Admin/Admin2`; tidak menjadikan frontend hiding sebagai authorization.

## 4. Actors & Permissions
Puskesmas > Bidan. Super Admin technical-only by default.

## 5. Preconditions
Staff record aktif dan assignment/scope tersedia.

## 6. User Stories
- `US-STAFF-001`: Bidan login dan hanya melihat assigned Bumil.
- `US-STAFF-002`: Puskesmas login dan melihat seluruh resource dalam Puskesmas scope.
- `US-STAFF-003`: Staff logout/revocation menghentikan session.

## 7. Functional Flow
Login → credential validation → role/scope load → session issue → protected API checks role+scope on every request.

## 8. Business Rules
- `BR-STAFF-001`: AuthN dan AuthZ terpisah.
- `BR-STAFF-002`: Puskesmas inherits every Bidan capability.
- `BR-STAFF-003`: disabled/revoked staff cannot refresh.
- `BR-STAFF-004`: MFA for Puskesmas/Super Admin remains `PROPOSED`.

## 9. Acceptance Criteria
- `AC-STAFF-001`: Given valid Bidan, when login, then restricted session issued.
- `AC-STAFF-002`: Given Bidan A, when requesting Bumil outside assignment, then 403 without data leakage.
- `AC-STAFF-003`: Given Puskesmas, when accessing Bidan-confirm operation in scope, then allowed.
- `AC-STAFF-004`: Revoked session cannot refresh.

## 10. UI/UX Specifications
Login, session-expired, forbidden, logout. Error copy must not expose internal policy details.

## 11. API References
`API-AUTH-001..005`, `API-STAFF-*`.

## 12. Data Model References
`staff_users`, `staff_sessions`, `staff_assignments`, `organizations/health_centers`.

## 13. Notifications & Side Effects
Security audit for repeated failures/lockout.

## 14. Error & Recovery Behavior
401 invalid/expired; 403 insufficient scope; 423 disabled/locked where appropriate.

## 15. Security & Privacy
Password hashing, rate limit, session rotation/revocation, CSRF strategy for cookie sessions if used.

## 16. Analytics & Audit Events
`STAFF_LOGIN_SUCCESS`, `STAFF_LOGIN_FAILURE`, `STAFF_LOGOUT`, `SESSION_REVOKED`, `AUTHZ_DENIED`.

## 17. Testing Scenarios
Role matrix, cross-area negatives, session theft/revocation, disabled user.

## 18. Dependencies & Rollout
Requires permission service before staff CRUD rollout.

## 19. Open Questions
MFA mechanism remains `PROPOSED`; not a core-domain blocker.

## 20. Implementation Status — 2026-08-08

Backend acceptance for login, generic failure, lockout, refresh replay protection, logout/revocation,
Puskesmas-superset scope, Bidan/cross-center denial, Super Admin default denial, and shared
idempotency/concurrency helpers are verified. Web staff states, exact edge-throttling policy, break-glass,
and MFA decision remain pending.
