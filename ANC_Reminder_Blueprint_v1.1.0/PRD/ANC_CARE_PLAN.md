# PRD: ANC K1–K8 Care Plan

> **Feature ID:** FEAT-ANC  
> **Version:** 1.0.0  
> **Status:** Review  
> **Priority:** P0  
> **Owner:** Clinical/Program Owner  
> **Dependencies:** FEAT-REGISTRY, ADR-007  
> **Last Updated:** 2026-08-08

## 1. Overview
K1–K8 adalah milestone/urutan kunjungan. Server menyimpan rule version agar target usia kehamilan/fasilitas dapat berubah tanpa update client.

## 2. Goals
Menentukan milestone berikutnya, fasilitas yang benar, reminder eligibility, dan program evidence secara konsisten.

## 3. Non-Goals
Tidak menentukan diagnosis, komplikasi, atau treatment. Exact clinical week boundary tidak boleh di-hardcode tanpa approval.

## 4. Actors & Permissions
Puskesmas/Clinical Owner mengelola rule setelah approval; Bidan/Bumil read applicable plan.

## 5. Preconditions
Pregnancy memiliki dating basis dan active care-plan version.

## 6. User Stories
- `US-ANC-001`: Bumil melihat K berikutnya.
- `US-ANC-002`: Puskesmas tahu K yang wajib Puskesmas.
- `US-ANC-003`: server menghitung state dari rule version.

## 7. Confirmed Rule Matrix

| Code | Program meaning | Phase | Facility rule | Detailed program record |
|---|---|---|---|---|
| K1 | kunjungan pertama | Trimester I | `PUSKESMAS_REQUIRED` | Yes |
| K2 | milestone kunjungan | Trimester II | configured flexible facility | Yes |
| K3 | milestone kunjungan | Trimester II | configured flexible facility | Yes |
| K4 | milestone kunjungan | Trimester II/III per approved config | `PUSKESMAS_REQUIRED` | Yes |
| K5 | milestone kunjungan | Trimester III | `PUSKESMAS_REQUIRED` | Yes |
| K6 | milestone kunjungan | Trimester III | configured flexible facility | Yes |
| K7 | milestone kunjungan | Trimester III | configured flexible facility | No in MVP |
| K8 | persalinan milestone | Delivery | `PONED_OR_RS_REQUIRED` | No full EMR |

Exact target week/window = `TBD CLINICAL CONFIG`, except descriptive phase above.

## 8. Business Rules
- Rule version immutable after activation; correction creates new version.
- New pregnancy snapshots applicable rule version.
- K1/K4/K5 facility restriction enforced server-side.
- K2/K3/K6/K7 allowed types come from configuration.
- K8 has separate category `DELIVERY`.
- Client may display server result but may not recompute authoritative milestone status.

## 9. Acceptance Criteria
`AC-ANC-001`: New pregnancy receives K1–K8 instances from active version.  
`AC-ANC-002`: K1/K4/K5 reject non-Puskesmas confirmation unless future approved override.  
`AC-ANC-003`: K8 accepts only configured PONED/RS facility types.  
`AC-ANC-004`: Updating rule version does not silently rewrite historical pregnancy snapshot.  
`AC-ANC-005`: Exact week values are configuration, not scattered constants.

## 10. UI/UX Specifications
Timeline `K1 → ... → K8`; location badge; due/overdue/confirmed state. Clinical detail hidden from Bumil except approved summary.

## 11. API References
`API-ANC-001..006`, `API-MILESTONE-001..004`.

## 12. Data Model References
`anc_plan_versions`, `anc_milestone_rules`, `pregnancy_milestones`, `facilities`.

## 13. Notifications & Side Effects
Milestone `due_at` feeds reminder scheduler for K1–K7 by default. K8 reminder eligibility is configurable and default `false` (`ASSUMED`).

## 14. Error & Recovery Behavior
Missing active rule version blocks pregnancy milestone creation with operational alert; invalid facility 422.

## 15. Security & Privacy
Rule editing requires Puskesmas program permission and audit.

## 16. Analytics & Audit Events
`CARE_PLAN_ACTIVATED`, `MILESTONE_CREATED`, `MILESTONE_DUE`, `RULE_REJECTED_FACILITY`.

## 17. Testing Scenarios
Versioning, historical snapshot, timezone boundary, invalid facility, K8 category.

## 18. Dependencies & Rollout
Clinical owner must supply/approve exact target windows before production.

## 19. Open Questions
`OPEN-CLIN-001`: final week/target schedule and allowed facility list.
