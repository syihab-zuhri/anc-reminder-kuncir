# Deployment & Operations Runbook

> **Project:** Sistem Pengingat ANC Ibu Hamil  
> **Document ID:** DOC-RUNBOOK  
> **Version:** 1.0.0  
> **Status:** Review  
> **Owner:** DevOps Lead  
> **Last Updated:** 2026-08-08  
> **Depends On:** DOC-ENV, DOC-ARCH

## 1. Status
Phase 1 staff authentication, scoped organization management, and audit path are executable. Later
domain/worker/Web smoke items remain design-ready until their owning phase is implemented.

## 2. Prerequisites
Approved build, migrations reviewed, secrets provisioned, FCM configured, clinical rule seed approved for environment, backup ready.

## 3. Deployment Order
DB migration → API → worker → Web → Android WebView release/config → smoke tests.

## 4. Database Migration
Backup/restore point before breaking migration. Forward migration preferred; destructive schema changes require explicit rollback/recovery plan.

For Phase 1 rehearsal: `npm run db:migrate` → `npm run db:verify:phase1`. The verifier uses only
synthetic rows inside a rollback transaction. Validate `npm run db:rollback` → `npm run db:migrate`
in staging before production rollout.

### Initial Puskesmas operator

After migration, set the transient `PROVISION_*` inputs documented in `DOC-ENV`, including the exact
confirmation phrase `CREATE_INITIAL_PUSKESMAS`, then run `npm run staff:provision:puskesmas`.
The command refuses a second Puskesmas account for the same health center and never prints the password.

## 5. Smoke Tests
Staff login; mother name+code; dashboard; K3 confirm by Bidan; Bidan denied detail write; Puskesmas detail validation; forced push terminal failure creates WA action; WA link generation; program status read.

The implemented Phase 1 subset is automated by `npm run test:smoke:auth`: login, identity lookup,
single-use refresh rotation, old-token rejection, Puskesmas-scoped village/facility/Bidan/assignment
management, Bidan management denial, disable-triggered session revocation, and logout.
`npm run test:smoke:idempotency` verifies one execution/one replay under concurrent same-key requests

`npm run test:smoke:registry` verifies a synthetic Puskesmas registration through the built API: active-plan precondition, AES-GCM NIK ciphertext, contact normalization, mother/pregnancy/consent state, and idempotency replay. It requires the same API environment and synthetic Puskesmas credentials as the staff smoke.
and rejects same-key/different-request reuse.

## 6. Rollback
Stop new worker claims if needed → roll back application version → apply compatible DB recovery strategy → verify reminder dedupe before resuming worker.

## 7. Health Checks
API liveness/readiness; DB connectivity; worker heartbeat/backlog; FCM adapter status; fallback backlog age.

## 8. Alerts (`PROPOSED`)
- API error/latency SLO breach.
- worker heartbeat missing.
- scheduler lag >15 min.
- push terminal failure spike.
- WA fallback unresolved age > configured SLA.
- DB connection/storage pressure.
- auth failure anomaly.

No alert/metric claims WhatsApp delivery from `wa.me`.

## 9. Backup and Restore
Daily or provider-equivalent backup `PROPOSED`; RPO 24h/RTO 8h target until pilot validates. Restore drill before launch.

## 10. Common Failures

### Push token invalid
Mark device invalid → create WA fallback once → show Puskesmas/Bidan scope queue.

### FCM temporary outage
Retry only retryable failures under configured max/backoff. After terminal policy reached, create fallback.

### WA fallback not actioned
Dashboard age/SLA → escalate to Puskesmas. Do not create duplicate unresolved action.

### Staff says WhatsApp failed
Because `wa.me` has no callback, staff records `UNREACHABLE`/manual note; Puskesmas sees escalation.

### Visit confirmed but reminder queued
Transaction/idempotency should suppress. Pause affected worker partition if repeated; inspect audit/outbox; never send from stale client state.

### Server unavailable
Web/WebView shows retry; check DB/API/runtime; clients do not switch to local authoritative mode.

### Staff credential or session incident
Disable the affected Bidan from the Puskesmas staff endpoint or revoke the specific session with a
required reason. Both paths invalidate access on the next request and create immutable audit evidence.
Rotating `SESSION_SECRET` invalidates all outstanding staff token hashes and therefore requires an
explicit all-user reauthentication plan.
Rotating `IDEMPOTENCY_SECRET` makes a pre-rotation key/fingerprint pair fail closed as `409`; operators
must reconcile the referenced mutation state before the client issues a new idempotency key.

### Bumil lost code
Puskesmas reissues; old credential revoked.

## 11. Incident Severity
Critical: data exposure/corruption/unauthorized program status. High: wrong reminder/facility or widespread reminder failure. Medium: fallback backlog, partial UI. Low: cosmetic.

## 12. Incident Flow
Detect → contain → preserve audit/log evidence → recover → validate reminder state → communicate owner → post-incident review.

## 13. Ownership
DevOps runtime/backup; Backend API/worker; Mobile WebView/FCM token; Puskesmas operational fallback; Clinical program rules; Security incident review.
