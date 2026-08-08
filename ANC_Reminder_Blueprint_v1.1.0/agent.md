# Agent & Developer Handoff

> **Project:** Sistem Pengingat ANC Ibu Hamil  
> **Document ID:** DOC-AGENT  
> **Version:** 1.1.0  
> **Status:** Review  
> **Owner:** Project Planning Lead  
> **Last Updated:** 2026-08-08  
> **Depends On:** All blueprint documents

## 1. Reading Order
1. `PROJECT_MANIFEST.md`
2. `PLANNING.md`
3. `SRS.md`
4. relevant `PRD/`
5. `PERMISSION.md`
6. `ERD.md`
7. `API.md`
8. `ARCHITECTURE.md`
9. `SECURITY.md`
10. `DSD.md`
11. `TESTING.md`
12. `TASKS.md`
13. `ENVIRONMENT.md`
14. `RUNBOOK.md`
15. `ADR/`
16. `TRACEABILITY.md`
17. `CHANGELOG.md`

## 2. Global Invariants

- Server is source of truth; Web/WebView are thin clients.
- Bumil auth = name + unique code; code hash only.
- Puskesmas permission superset of Bidan.
- Bidan confirm-only K2/K3/K6/K7; no K1–K6 detail write.
- Puskesmas owns K1–K6 detail/validation.
- Bumil never self-confirms visit.
- K1/K4/K5 require Puskesmas; K8 PONED/RS.
- Exact milestone weeks and program criteria are versioned configuration.
- Reminder cadence = every 3 days while eligible and unconfirmed.
- Push first, controlled retry, then manual `wa.me`.
- Never claim `wa.me` `SENT/DELIVERED/READ/FAILED` from link state.
- Confirmation atomically suppresses reminder for same milestone.
- No secret or production patient data in repo/lower env.

## 3. Agent Scope

### Product/Project Agent
May update planning/SRS/PRD/tasks/traceability/changelog. Clinical rule changes require named owner approval.

### Frontend/Mobile Agent
Implements render/actions from API/DSD. Must not duplicate authoritative ANC/reminder/program rules or store sensitive session in plain WebView storage.

### Backend Agent
Owns business modules/API/jobs/migrations, permission enforcement, transactions, outbox.

### Data Agent
Owns schema/index/migration review; preserves historical rule/assessment/audit.

### QA Agent
Owns traceability evidence, clock/concurrency, negative authorization, WA status-semantics tests.

### Security Reviewer
Owns authz, URL/log leakage, WebView security, credential/session review.

### Infra/DevOps Agent
Owns environment, secrets, deployment, worker, monitoring, backup/restore.

### Clinical/Program Owner
Approves K1–K8 target windows, facility wording, K1–K6 components, Sigizi Kesga/Hak Janin rule/content.

## 4. File Editing Boundaries

Schema change → ERD/API/migration/tests/changelog.  
Permission change → PERMISSION/API/security tests.  
Notification behavior → PRD-NOTIF/ADR-006/API/ERD/tests.  
Clinical/program rule → PRD-ANC/PROGRAM + named approval + versioned config.  
Architecture change → new/superseding ADR.

## 5. Definition of Done for Any P0 Task

Code reviewed; references included; tests pass; auth/error/audit/logging considered; migration notes if data changes; docs/changelog/traceability updated; no secret/real patient data.

## 6. Escalation Rules

Stop and escalate if source docs conflict, implementation would require automatic WhatsApp while ADR-006 is active, a client must become authoritative, clinical rule is missing for production seed, or Critical/High security issue appears.

## 7. Execution Start

Gate C design is complete. Phase-0 workspace, environment validation, baseline migration, observability, Web shell, and Android foundation have passed local and hosted CI verification. Baseline migration passed PostgreSQL `up → down → up` and API liveness/readiness smoke tests. Public `main` is protected by mandatory pull requests and the strict `verify` check.

Phase 1 tasks `TASK-P1-001`–`TASK-P1-004`, `TASK-P1-006`, and the staff Web access `TASK-P1-007` are implemented and locally verified with PostgreSQL/API/Web smoke coverage; protected CI must pass before merge. Break-glass and MFA remain explicit owner decisions—do not silently enable either. Clinical/Privacy owners may resolve production approvals in parallel, but do not invent final week windows or legal retention.
