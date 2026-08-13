# Deployment & Operations Runbook

> **Project:** Sistem Pengingat ANC Ibu Hamil  
> **Document ID:** DOC-RUNBOOK  
> **Version:** 1.0.0  
> **Status:** Review  
> **Owner:** DevOps Lead  
> **Last Updated:** 2026-08-10  
> **Depends On:** DOC-ENV, DOC-ARCH

## 1. Status
Phase 1 staff authentication/scoped organization/audit and the Phase 2 registry, pregnancy lifecycle,
mother credential, and restricted mother-session paths are executable. Later domain/worker/Web smoke items
remain design-ready until their owning phase is implemented.

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

### Clinical program owner

Only after formal owner designation, set the transient `CLINICAL_OWNER_*` inputs documented in `DOC-ENV` and
run `npm run staff:set:clinical-owner`. Use `CLINICAL_OWNER_ENABLED=true` to grant or `false` to revoke. The
command requires the exact phrase `CHANGE_CLINICAL_PROGRAM_OWNER`, refuses a grant to an inactive/non-Puskesmas
account, writes an append-only system audit event, and prints only the target ID plus resulting boolean state.

## 5. Smoke Tests
Staff login; mother name+code; dashboard; K3 confirm by Bidan; Bidan denied detail write; Puskesmas detail validation; forced push terminal failure creates WA action; WA link generation; program status read.

### FCM and Android activation

1. Create/register Android app id `id.my.kuncir.posyandu.anc` in the approved Firebase project.
2. Place the environment-specific `google-services.json` at `apps/android/android/app/google-services.json` locally or in the private mobile-build pipeline. It is intentionally gitignored.
3. Inject `FCM_PROJECT_ID`, the complete `FCM_SERVICE_ACCOUNT_JSON`, and the same dedicated `PUSH_TOKEN_ENCRYPTION_KEY` into the worker; inject that push-token key into the API.
4. Run `npm run cap:sync --workspace=@anc/android`, build the Android app, authenticate with a synthetic test mother, grant notification permission, and verify `PUT /mother/me/devices/android` returns only device metadata.
5. Force one FCM success, one `UNAVAILABLE` retry (including `Retry-After`), and one `UNREGISTERED` response. Verify success closes the cycle, retry creates a delayed attempt, and terminal invalidates the device plus creates exactly one manual `wa.me` fallback.

Never commit Firebase credentials or a production `google-services.json`, and never print a registration token while troubleshooting.

The implemented Phase 1 subset is automated by `npm run test:smoke:auth`: login, identity lookup,
single-use refresh rotation, old-token rejection, Puskesmas-scoped village/facility/Bidan/assignment
management, Bidan management denial, disable-triggered session revocation, and logout.
`npm run test:smoke:idempotency` verifies one execution/one replay under concurrent same-key requests
and rejects same-key/different-request reuse.

`npm run test:smoke:registry` verifies a synthetic Puskesmas registration through the built API: active-plan precondition, AES-GCM NIK ciphertext, contact normalization, mother/pregnancy/consent state, dating revision history, one-active-pregnancy enforcement, close/recreate lifecycle, and idempotency replay. Close coverage snapshots every pre-close milestone state, cancels only unfinished milestones/unresolved reminder cycles, expires unresolved `wa.me` work, preserves terminal outcomes, rejects post-close reminder creation, and proves cancellation history is append-only. It also issues/replays/reissues/revokes a Bumil access code, proves plaintext is response-only, checks salted scrypt plus HMAC lookup persistence, enforces one active credential, verifies audit counts, and rejects credential-history mutation. The same smoke proves uniform wrong-name/revoked-code failures, creates an HMAC-only restricted session, reads the minimum own-only DTO, rejects the bearer at a staff boundary, durably revokes it on logout, blocks the 11th IP failure under defaults, and checks that no raw identity/IP/code/token enters throttle or audit state. It requires the same API environment and synthetic Puskesmas credentials as the staff smoke.

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

### Mother access unexpectedly rate-limited
Check configured `MOTHER_ACCESS_*` thresholds and safe aggregate failure/audit metrics; never inspect or log raw
codes, names, bearer tokens, or source IPs from HMAC buckets. Wait for `retry_after_seconds`/block expiry or use a
reviewed operational response to abuse. Do not delete rate rows merely to bypass an active attack.

## 11. Incident Severity
Critical: data exposure/corruption/unauthorized program status. High: wrong reminder/facility or widespread reminder failure. Medium: fallback backlog, partial UI. Low: cosmetic.

## 12. Incident Flow
Detect → contain → preserve audit/log evidence → recover → validate reminder state → communicate owner → post-incident review.

## 13. Ownership
DevOps runtime/backup; Backend API/worker; Mobile WebView/FCM token; Puskesmas operational fallback; Clinical program rules; Security incident review.
