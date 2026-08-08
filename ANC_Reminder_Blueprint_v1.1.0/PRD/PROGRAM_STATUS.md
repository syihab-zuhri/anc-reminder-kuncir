# PRD: Program Status — Sigizi Kesga / Memenuhi Hak Janin

> **Feature ID:** FEAT-PROGRAM  
> **Version:** 1.0.0  
> **Status:** Review  
> **Priority:** P0  
> **Owner:** Clinical/Program Owner  
> **Dependencies:** FEAT-CHECKUP, ADR-007  
> **Last Updated:** 2026-08-08

## 1. Overview
Evaluasi administratif program dipisahkan dari kunjungan dan diagnosis.

## 2. Goals
Menentukan kelengkapan pencatatan secara auditable dengan rule version.

## 3. Non-Goals
Bukan diagnosis, risk score, atau clinical decision support. K6 tidak otomatis memberi predikat tanpa memenuhi active rule.

## 4. Actors & Permissions
Puskesmas melihat/menjalankan assessment; Clinical/Program Owner approves rule; Bidan read summary only if needed; Bumil dapat melihat label yang telah disetujui untuk ditampilkan.

## 5. Preconditions
Active program rule version dan required record evidence.

## 6. User Stories
`US-PROG-001` Puskesmas melihat apa yang belum lengkap.  
`US-PROG-002` Server mengevaluasi setelah evidence berubah.  
`US-PROG-003` History status tetap queryable.

## 7. Functional Flow
K1–K6 records/validation change → evaluator loads active rule snapshot → checks required milestones/components → stores assessment → optional approved label display.

## 8. Business Rules
- Default proposed required milestone set: K1/K4/K5/K6, plus configured component requirements.
- Rule can be changed only by new version.
- Assessment stores rule_version, evaluated_at, evaluated_by=`SYSTEM` or staff correction, and result.
- Suggested fields: `sigizi_kesga_recording_status = IN_PROGRESS|COMPLETE`; `fetal_rights_status = NOT_YET_MET|MET`.
- A manual correction requires Puskesmas reason/audit.

## 9. Acceptance Criteria
`AC-PROG-001`: K6 confirmed but missing required K4 validation does not produce `MET`.  
`AC-PROG-002`: Complete evidence under approved rule produces `COMPLETE/MET`.  
`AC-PROG-003`: Rule update does not rewrite historical assessment silently.  
`AC-PROG-004`: Bumil cannot set program status.

## 10. UI/UX Specifications
Puskesmas sees progress checklist and current administrative label; avoid diagnostic wording.

## 11. API References
`API-PROGRAM-001..003`.

## 12. Data Model References
`program_rule_versions`, `program_rule_requirements`, `program_assessments`.

## 13. Notifications & Side Effects
No automatic medical alert. Optional internal completion badge only.

## 14. Error & Recovery Behavior
Missing approved rule → status `NOT_EVALUATED` with operational notice.

## 15. Security & Privacy
Assessment visible only within role/scope; evidence minimization.

## 16. Analytics & Audit Events
`PROGRAM_ASSESSMENT_RECALCULATED`, `PROGRAM_STATUS_CHANGED`, `PROGRAM_RULE_ACTIVATED`.

## 17. Testing Scenarios
Missing one requirement, rule versioning, correction, permission negative.

## 18. Dependencies & Rollout
`OPEN-CLIN-002` approval required before production label activation.

## 19. Open Questions
Exact official definition/wording and required components require Clinical/Program Owner sign-off.
