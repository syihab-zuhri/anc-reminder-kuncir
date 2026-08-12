# PRD: Check-up Tracking

> **Feature ID:** FEAT-CHECKUP  
> **Version:** 1.0.0  
> **Status:** Review  
> **Priority:** P0  
> **Owner:** Product Owner + Clinical/Program Owner  
> **Dependencies:** FEAT-ANC, DOC-PERMISSION  
> **Last Updated:** 2026-08-12

## 1. Overview
Memisahkan **konfirmasi kunjungan** dari **validasi detail pencatatan**.

## 2. Goals
Bidan dapat konfirmasi cepat; Puskesmas tetap menjadi pengelola detail K1–K6.

## 3. Non-Goals
Bidan tidak mengisi USG/lab/imunisasi/skrining/detail program melalui flow confirm-only. Bumil tidak self-confirm.

## 4. Actors & Permissions

| Action | Bumil | Bidan | Puskesmas |
|---|---:|---:|---:|
| View own/basic | Own | Assigned | Scope |
| Confirm K2/K3/K6/K7 | No | Yes | Yes |
| Confirm K1/K4/K5 | No | No | Yes |
| Confirm K8 status | No | No by default | Yes |
| Edit detailed K1–K6 | No | No | Yes |
| Validate detailed K1–K6 | No | No | Yes |

## 5. Preconditions
Milestone instance exists and actor has scope.

## 6. User Stories
`US-CHECK-001`: Bidan taps `Konfirmasi Sudah Periksa`.  
`US-CHECK-002`: Puskesmas sees confirmer/time.  
`US-CHECK-003`: Puskesmas completes and validates K1–K6 detail.  
`US-CHECK-004`: Confirmation stops reminder immediately.

## 7. State Model

Two independent fields:

`visit_status`: `UPCOMING → DUE/OVERDUE → CONFIRMED`; alternate `CANCELLED | NOT_APPLICABLE`.

`record_validation_status`: `NOT_REQUIRED | INCOMPLETE | VALIDATED`.

K1–K6 normally use `INCOMPLETE/VALIDATED`; K7/K8 use `NOT_REQUIRED` in MVP.

## 8. Business Rules
- Confirmation mutation is idempotent by milestone.
- Every confirmation stores `confirmed_by`, `confirmed_at`, `confirmation_source`.
- Bidan confirmation does not imply detail complete.
- Puskesmas inherits Bidan confirmation capability.
- Reminder suppression occurs on valid `CONFIRMED`, not after detail validation.
- Correction after confirmation/validation requires Puskesmas and audit; no hard delete.
- Detail saves use optimistic concurrency and append-only revisions; a validated record must be reopened with a reason before correction.
- Final validation requires an already confirmed visit and explicit Puskesmas review attestation. Automatic component completeness remains configuration-driven and cannot use unapproved hardcoded fields.

## 9. Acceptance Criteria
`AC-CHECK-001`: Given assigned Bidan and K3 due, when confirm, then status becomes CONFIRMED without clinical form.  
`AC-CHECK-002`: Given Bidan attempts K4 confirm, then server denies unless actor has Puskesmas capability.  
`AC-CHECK-003`: Given K3 confirmed by Bidan, Puskesmas can later validate detailed K3.  
`AC-CHECK-004`: Given CONFIRMED, scheduler cannot create future K3 cycle.  
`AC-CHECK-005`: Given Bumil calls confirm API, server returns 403.  
`AC-CHECK-006`: duplicate confirm does not create duplicate audit/state.
`AC-CHECK-007`: Given two Puskesmas editors save from one revision, exactly one succeeds and one reloads after conflict.  
`AC-CHECK-008`: Given a confirmed K1–K6 record, validation synchronizes record/milestone state and preserves validator/time.  
`AC-CHECK-009`: Given a validated record, edit is rejected until a reasoned reopen creates an immutable event.

## 10. UI/UX Specifications
Bidan: one prominent `Konfirmasi Sudah Periksa` action, optional confirmation dialog only.  
Puskesmas: timeline + `Kelola Detail Kx` for K1–K6 + validation state.

## 11. API References
`API-VISIT-001..006`.

## 12. Data Model References
`pregnancy_milestones`, `visit_confirmations`, `k1_k6_records`, `record_validation_events`.

## 13. Notifications & Side Effects
Successful confirmation atomically suppresses pending reminder cycles/fallback actions for same milestone.

Implementation status: `TASK-P2-012` makes the confirmed milestone immediately ineligible in server-composed timeline/next-milestone reads. Atomic coordination with an already-running reminder cycle/outbox remains owned by `TASK-P4-014` and must pass `TEST-VISIT-004` before production.

## 14. Error & Recovery Behavior
403 role/scope; 409 invalid transition; 422 facility rule violation; correction workflow for wrong confirmation.

## 15. Security & Privacy
Server authorization only; detail fields not serialized to Bidan/Bumil DTO.

## 16. Analytics & Audit Events
`VISIT_CONFIRMED`, `VISIT_CONFIRM_CORRECTED`, `RECORD_VALIDATED`.

## 17. Testing Scenarios
Role matrix, concurrent confirmation vs scheduler, duplicate click, facility constraint, detail field leakage.

## 18. Dependencies & Rollout
Must release with server-side permission tests.

## 19. Open Questions
Final Puskesmas correction policy before production.
