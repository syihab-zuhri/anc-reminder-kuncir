# PRD: Mother Private Access

> **Feature ID:** FEAT-MOTHER-ACCESS  
> **Version:** 1.0.0  
> **Status:** Review  
> **Priority:** P0  
> **Owner:** Product Owner + Security  
> **Dependencies:** FEAT-REGISTRY, ADR-001  
> **Last Updated:** 2026-08-10

## 1. Overview
Bumil mengakses ringkasan privat dengan **nama + kode unik**.

## 2. Goals
Akses sederhana tanpa username/password dan tanpa public search.

## 3. Non-Goals
`wa.me` bukan authentication. Nomor HP bukan secret authenticator.

## 4. Actors & Permissions
Bumil hanya own pregnancy summary; staff issue/revoke/reissue code.

## 5. Preconditions
Active pregnancy, active access credential.

## 6. User Stories
`US-MACCESS-001` akses dengan nama+kode; `US-MACCESS-002` petugas reissue code; `US-MACCESS-003` WebView binds FCM token after permission.

## 7. Functional Flow
Name + code → normalized name comparison strategy → hash verification → anti-enumeration/rate-limit → restricted session → own dashboard DTO.

## 8. Business Rules
- Code random and high entropy; store hash only.
- Staff handoff code is `ANC-XXXX-XXXX-XXXX-XXXX` with 16 random unambiguous Base32 symbols (80 bits entropy); plaintext is displayed once.
- Failure response must not say whether name exists.
- Durable defaults: 10 failures/IP and 5 failures/code in 15 minutes, then a 15-minute block; raw IP/code values are never persisted in rate buckets.
- Restricted sessions are opaque, revocable, own-only, and default to 30 days without an MVP refresh route.
- Reissue revokes previous credential/session according to policy.
- WebView stores sensitive session in platform secure storage, not plain localStorage.

## 9. Acceptance Criteria
`AC-MACCESS-001`: correct pair opens only own data.  
`AC-MACCESS-002`: wrong name/code gives generic failure.  
`AC-MACCESS-003`: old code fails after reissue.  
`AC-MACCESS-004`: Bumil cannot call visit-confirm endpoints.  
`AC-MACCESS-005`: device token is associated only after authenticated session + permission.

## 10. UI/UX Specifications
Two fields: Nama + Kode Unik. No mother search autocomplete. Provide lost-code contact path to Puskesmas/Bidan.

## 11. API References
`API-MACCESS-001..005`, `API-DEVICE-001`.

## 12. Data Model References
`mother_access_credentials`, `mother_sessions`, `devices`.

## 13. Notifications & Side Effects
Successful WebView access may register push token.

## 14. Error & Recovery Behavior
Generic 401; 429 rate-limited; revoked code requires staff reissue.

## 15. Security & Privacy
Code never logged, persisted as plaintext, or included in QR analytics; secure storage required. Staff idempotency replay never returns the code again.

## 16. Analytics & Audit Events
`MOTHER_ACCESS_SUCCESS/FAILURE/THROTTLED`, `MOTHER_LOGOUT`, `ACCESS_CODE_REISSUED`, `DEVICE_REGISTERED`.

## 17. Testing Scenarios
Enumeration, brute force throttling, session fixation, WebView storage, cross-mother access.

## 18. Dependencies & Rollout
ADR-001 Accepted.

## 19. Open Questions
No open question for credential format or application throttle defaults. Security implementation review fixed the 80-bit display format, salted scrypt verifier, HMAC-only lookup/rate/session hashes, 30-day restricted session, and 10/IP plus 5/code throttle defaults on 2026-08-10. Pilot review may tune the environment values and add edge controls without weakening the application boundary.

## 20. Implementation Status — 2026-08-10

`TASK-P2-003` implements Puskesmas-only same-center issue/reissue/revoke, one-active-credential enforcement, active-pregnancy gating for issuance, session revocation, immutable credential lifecycle snapshots, resource-only idempotency, and audited reason-bearing mutations. `TASK-P2-004` implements public name/code verification, uniform anti-enumeration failures, durable HMAC-only IP/code throttling, opaque restricted session issuance/logout, per-request active-state revalidation, staff/mother role separation, and a minimum-data `/mother/me` DTO.
