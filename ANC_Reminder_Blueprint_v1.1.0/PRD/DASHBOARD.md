# PRD: Role Dashboards

> **Feature ID:** FEAT-DASHBOARD  
> **Version:** 1.0.0  
> **Status:** Review  
> **Priority:** P0  
> **Owner:** Product Owner  
> **Dependencies:** FEAT-ANC, FEAT-CHECKUP, FEAT-NOTIF  
> **Last Updated:** 2026-08-08

## 1. Overview
Server-composed dashboards untuk Puskesmas, Bidan, dan Bumil.

## 2. Goals
Role-specific information tanpa client-side domain calculation.

## 3. Non-Goals
Tidak menampilkan diagnosis/risk inference; tidak menyimpan health data sebagai authoritative local cache.

## 4. Actors & Permissions
Puskesmas aggregate scope; Bidan assigned scope; Bumil own only.

## 5. Preconditions
Authenticated session.

## 6. User Stories
`US-DASH-001` Puskesmas melihat due/overdue, push failure, WA fallback.  
`US-DASH-002` Bidan melihat Bumil yang perlu konfirmasi.  
`US-DASH-003` Bumil melihat next K dan lokasi.

## 7. Functional Flow
Client requests role dashboard endpoint → server authorizes → server composes DTO from domain services → client renders.

## 8. Business Rules
No domain join/calculation in client. Puskesmas dashboard includes unresolved fallback even when Bidan has not acted. Bumil cannot see staff audit or detailed records.

## 9. Acceptance Criteria
- Puskesmas sees aggregate + action queue.
- Bidan sees only assigned mothers.
- Bumil sees own timeline.
- Server-down shows retry state, not stale authoritative state.

## 10. UI/UX Specifications
Puskesmas: summary cards + priority table. Bidan: “Perlu Konfirmasi” and “Perlu WA”. Bumil: gestational summary, next visit, timeline K1–K8, location badge.

## 11. API References
`API-DASH-001..003`.

## 12. Data Model References
Read models over pregnancy/milestone/reminder data.

## 13. Notifications & Side Effects
Dashboard read has no state side effect.

## 14. Error & Recovery Behavior
401/403, empty scope, partial dependency error handled with explicit status.

## 15. Security & Privacy
DTO minimization per role.

## 16. Analytics & Audit Events
No sensitive analytics payload; optional page/action counts.

## 17. Testing Scenarios
Role isolation, pagination, counts, server-down state.

## 18. Dependencies & Rollout
Requires server view-model endpoints.

## 19. Open Questions
None material.
