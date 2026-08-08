# Requirement Traceability Matrix

> **Project:** Sistem Pengingat ANC Ibu Hamil  
> **Document ID:** DOC-TRACE  
> **Version:** 1.1.0  
> **Status:** Review  
> **Owner:** QA Lead  
> **Last Updated:** 2026-08-08  
> **Depends On:** DOC-SRS, PRD documents, DOC-TASKS

## 1. P0 Matrix

| Requirement | Feature/PRD | API/UI | Data | Permission | Task | Test | Status |
|---|---|---|---|---|---|---|---|
| FR-001 | FEAT-STAFF | API-AUTH | staff_users/sessions | Staff | TASK-P1-001 | auth suite | Covered |
| FR-002 | FEAT-STAFF | all protected | assignments | Role/scope | TASK-P1-003 | TEST-AUTH-001 | Covered |
| FR-003 | FEAT-STAFF/REGISTRY | staff/facility UI | staff/facility | Puskesmas | TASK-P1-002/P3-001 | scoped CRUD | Covered |
| FR-004 | FEAT-REGISTRY | API-MOTHER-001 + registration UI | mothers/pregnancies/consent | Puskesmas | TASK-P2-001/P3-002 | AC-REG-001..004, TEST-REG-001..004 | Covered |
| FR-005 | FEAT-REGISTRY | API-MOTHER-001/API-PREG | pregnancies.dating_date | Puskesmas | TASK-P2-001/P2-002 | TEST-REG-002/004 + lifecycle | Covered |
| FR-006 | FEAT-MOTHER-ACCESS | API-MACCESS-001 | credentials | Bumil/Puskesmas | TASK-P2-003/004 | TEST-AUTH-002 | Covered |
| FR-007 | FEAT-MOTHER-ACCESS | reissue | credentials | Puskesmas | TASK-P2-003 | revoke/reissue | Covered |
| FR-009 | FEAT-ANC | API-MILESTONE-003 | milestone rules | Puskesmas | TASK-P2-006 | due-date tests | Covered |
| FR-015 | FEAT-NOTIF | API-DEVICE-001 | devices | Bumil | TASK-P4-004/005 | mobile integration | Covered |
| FR-017 | FEAT-CHECKUP/NOTIF | confirm/close | milestone/reminder | staff | TASK-P4-014 | TEST-VISIT-004 | Covered |
| FR-018 | FEAT-REGISTRY/NOTIF | consent | consent_records | Puskesmas/Bumil | TASK-P2-001 | consent test | Covered |
| FR-019 | FEAT-DASHBOARD | API-DASH-003 | read model | Bumil own | TASK-P3-005/010 | privacy E2E | Covered |
| FR-020 | FEAT-DASHBOARD/NOTIF | API-DASH/REM | fallback | scoped | TASK-P2-009/P3-006 | TEST-NOTIF-006 | Covered |
| FR-022 | cross-cutting | audit | audit_events | server | TASK-P1-004 | audit tests | Covered |
| FR-024 | FEAT-REGISTRY | close | pregnancy/reminders | Puskesmas | TASK-P2-008 | close test | Covered |
| FR-029 | FEAT-ANC | API-ANC/MILESTONE | plan/milestones | Puskesmas read/write cfg | TASK-P2-010 | TEST-ANC-001..003 | Covered |
| FR-030 | FEAT-CHECKUP | API-VISIT-001 | confirmations | Bidan/Puskesmas | TASK-P2-012/P3-009 | TEST-VISIT-001 | Covered |
| FR-031 | FEAT-CHECKUP | API-VISIT-003..006 | k1_k6_records | Puskesmas | TASK-P2-013/P3-008 | TEST-VISIT-002/003 | Covered |
| FR-032 | FEAT-ANC | confirm validation | rules/facilities | server | TASK-P2-010 | TEST-ANC | Covered |
| FR-033 | FEAT-NOTIF | internal scheduler | milestones | server | TASK-P2-011/P4-002 | clock tests | Covered |
| FR-034 | FEAT-NOTIF | worker | reminder_cycles | worker | TASK-P4-002 | TEST-NOTIF-001 | Covered |
| FR-035 | FEAT-NOTIF | FCM adapter | push_attempts | worker | TASK-P4-005 | TEST-NOTIF-002 | Covered |
| FR-036 | FEAT-NOTIF | API-REM-003 | wa_fallback_actions | Bidan/Puskesmas | TASK-P4-011/013 | TEST-NOTIF-003/004 | Covered |
| FR-037 | FEAT-NOTIF | API-REM | push/wa states | scoped | TASK-P4-012 | TEST-NOTIF-005 | Covered |
| FR-038 | FEAT-NOTIF/DASH | API-REM-007 | fallback/escalation | Puskesmas | TASK-P4-008 | TEST-NOTIF-006 | Covered |
| FR-039 | FEAT-DASHBOARD | API-DASH | read models | all | TASK-P2-015/P3-011 | TEST-CLIENT-001 | Covered |
| FR-040 | FEAT-PROGRAM | API-PROGRAM | program rules/assessments | Puskesmas | TASK-P2-014 | TEST-PROG | Covered |
| FR-041 | DOC-PERMISSION | protected APIs | role policy | Puskesmas | TASK-P1-003 | TEST-VISIT-003 | Covered |
| FR-042 | FEAT-CHECKUP | confirm API negative | — | Bumil denied | TASK-P6-002 | negative E2E | Covered |
| FR-043 | FEAT-ANC | milestone UI/API | milestones | Puskesmas | TASK-P2-010/P3-010 | TEST-ANC-003 | Covered |

## 2. P1 Matrix

FR-021, FR-023, FR-026, FR-028 remain covered by P1 tasks/PRDs but are not P0 release blockers.

## 3. Coverage Assessment

P0 documentation coverage: **Pass**. Phase-0 foundation implementation evidence is available; business requirement implementation remains **Pending**. Traceability status becomes implementation `Verified` only after each referenced business test actually runs.

## 4. Foundation Implementation Evidence — 2026-08-08

| Scope | Evidence | Result |
|---|---|---|
| Workspaces | Clean `npm ci`; Web/API/worker/contracts/config/database/Android build | Pass |
| Static quality | Prettier, ESLint, TypeScript strict | Pass |
| Foundation tests | 37 Vitest unit/integration tests | Pass |
| Database | PostgreSQL 17 baseline `up → down → up`; 22 domain tables | Pass locally |
| API operations | `/api/v1/health/live` and `/api/v1/health/ready` against PostgreSQL | HTTP 200/200 |
| Security hygiene | UUID-v4 request ID, log redaction, trusted WebView origin, production HTTPS/DB TLS config, secret scan | Pass locally |
| Dependency scan | `npm audit --audit-level=moderate` | 0 vulnerabilities |

Hosted CI run `31244315334` passed, including migration rollback/forward evidence for `TASK-P0-005`. Protected-branch enforcement remains pending under `TASK-P0-003` because GitHub Pro is required for the private repository; see `OPEN-REPO-001`. This foundation evidence does not mark FR-001–FR-043 as implemented.
