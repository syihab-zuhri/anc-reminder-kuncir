# Authentication & Authorization

> **Project:** Sistem Pengingat ANC Ibu Hamil  
> **Document ID:** DOC-PERMISSION  
> **Version:** 1.0.0  
> **Status:** Review  
> **Owner:** Security Architect  
> **Last Updated:** 2026-08-12  
> **Depends On:** DOC-SRS

## 1. Principles

Backend enforcement, least privilege, explicit resource scope, deny-by-default, authorization distinct from authentication.

## 2. Roles

| Role | Description |
|---|---|
| `BUMIL` | Own approved data only |
| `BIDAN` | Assigned mothers/areas; confirm-only K2/K3/K6/K7; optional manual WA fallback |
| `PUSKESMAS` | Superset of Bidan + registry/schedule/detail K1–K6/validation/program/aggregate fallback |
| `SUPER_ADMIN` | Technical operations; no routine health-data read |
| `REMINDER_WORKER` | Service identity; no interactive login |

`CLINICAL_PROGRAM_OWNER` is a governance capability that may be granted to selected Puskesmas staff, not a mandatory separate login role.

The implementation stores this grant as `staff_users.clinical_program_owner`. Draft creation requires the
Puskesmas care-plan capability; approval and activation additionally require this explicit active-account flag.
The default is `false`, including for existing and newly provisioned staff.

## 3. Capability Matrix

| Capability | Bumil | Bidan | Puskesmas | Super Admin | Worker |
|---|---:|---:|---:|---:|---:|
| Read own summary | ✅ own | — | — | ❌ | ❌ |
| Read assigned/scoped Bumil basic | ❌ | ✅ | ✅ | ❌ | limited service |
| Register/edit Bumil/pregnancy | ❌ | ❌ | ✅ | ❌ | ❌ |
| Assign Bidan | ❌ | ❌ | ✅ | ❌ | ❌ |
| Confirm K2/K3/K6/K7 | ❌ | ✅ | ✅ | ❌ | ❌ |
| Confirm K1/K4/K5 | ❌ | ❌ | ✅ | ❌ | ❌ |
| Confirm K8 status | ❌ | ❌ | ✅ | ❌ | ❌ |
| Edit detailed K1–K6 | ❌ | ❌ | ✅ | ❌ | ❌ |
| Validate detailed K1–K6 | ❌ | ❌ | ✅ | ❌ | ❌ |
| View own WA fallback queue | ❌ | ✅ assigned | ✅ all scope | ❌ | ❌ |
| Generate `wa.me` action | ❌ | ✅ assigned | ✅ scope | ❌ | service endpoint only |
| Mark WA fallback outcome | ❌ | ✅ assigned | ✅ scope | ❌ | ❌ |
| View aggregate unresolved fallback | ❌ | limited assigned | ✅ | ❌ | ❌ |
| Manage care-plan/program rule | ❌ | ❌ | ✅ with capability | ❌ | ❌ |
| Program assessment correction | ❌ | ❌ | ✅ with reason | ❌ | ❌ |
| Technical config | ❌ | ❌ | limited | ✅ | ❌ |
| Routine health-data read | own | scoped | scoped | ❌ | minimum necessary |

## 4. Resource Scope

Bidan: explicit assignment/area scope. Puskesmas: Puskesmas organization/facility scope. Bumil: own `mother_id/pregnancy_id` from restricted session. Scope filters are always applied server-side.

`API-VISIT-001` enforces this scope inside the same transaction that locks and confirms the milestone. Bidan replay access is re-evaluated against the current active assignment and K2/K3/K6/K7 code boundary; Puskesmas remains limited to the same health center. Facility IDs must also resolve to an active facility in that center.

## 5. Row-Level Rules

- Every pregnancy/milestone/record/fallback query must resolve actor scope first.
- Bidan cannot gain broader access by submitting a different `pregnancy_id`.
- Puskesmas can perform Bidan operation for any resource in its scope.
- Super Admin must not bypass health scope unless approved break-glass is active.
- Service worker receives only fields required to schedule/send push.

## 6. Endpoint Mapping

| API group | Bumil | Bidan | Puskesmas |
|---|---:|---:|---:|
| `/mother-access/*` | ✅ limited | staff issue/reissue | ✅ |
| `/dashboard/me` | ✅ | ✅ | ✅ |
| `/milestones/:id/confirm` | ❌ | selected K only | ✅ |
| `/records/k1-k6/*` | ❌ | read basic only | ✅ write/validate |
| `/reminders/:id/wa-link` | ❌ | assigned | scope |
| `/reminders/:id/manual-outcome` | ❌ | assigned | scope |
| `/program/*` | own approved status read | optional read | ✅ |

## 7. Session Lifecycle

Staff sessions revocable. Bumil session bound to validated name+code credential and revoked on credential reissue according to policy. WebView uses secure storage for sensitive session material.

Implemented staff lifecycle uses short-lived opaque access credentials and rotating single-use refresh
credentials. Only keyed hashes are persisted; protected requests re-check session, account, health-center, and
active assignment state. Disabling a Bidan revokes all active sessions in the same transaction.

## 8. Break-glass

`PROPOSED P1`: time-bound, reason required, audited before data read, auto-expiring. Not required for normal support workflows.

## 9. Sensitive Operations

Care-plan activation, program-rule activation, confirmation correction, record validation correction, credential reissue, export, and break-glass require audit.

ANC plan draft creation, approval, and activation are separate audited actions. Approval evidence is referenced
by an identifier only; the public repository and generic audit metadata must not contain a signature or sensitive attachment.

## 10. Authorization Failure Behavior

401 for unauthenticated; 403 for authenticated but unauthorized; error bodies avoid revealing existence of out-of-scope Bumil.

## 11. Least Privilege Review Checklist

Cross-area negative tests, Bidan cannot edit detail, Bumil cannot confirm, Puskesmas superset verified, Super Admin denied by default, worker token constrained.
