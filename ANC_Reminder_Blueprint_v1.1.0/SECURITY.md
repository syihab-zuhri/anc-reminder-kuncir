# Security, Privacy & Threat Model

> **Project:** Sistem Pengingat ANC Ibu Hamil  
> **Document ID:** DOC-SECURITY  
> **Version:** 1.1.0  
> **Status:** Review  
> **Owner:** Security Reviewer  
> **Last Updated:** 2026-08-10  
> **Depends On:** DOC-ARCH, DOC-PERMISSION

## 1. Security Objectives

Confidentiality of mother/pregnancy data, integrity of visit/program state, least privilege, safe notification content, auditable critical actions, availability of server-centric system.

## 2. Data Classification

| Class | Examples |
|---|---|
| Restricted | NIK, full address, phone/contact, pregnancy dates, K1–K6 detail, program evidence, access credential/session |
| Confidential/Internal | staff assignment, reminder operational metadata |
| Public | approved generic education content only |

## 3. Threat Model

### T1 — Mother Enumeration
Mitigation: generic name+code failure, throttling, no public search, opaque UUID.

### T2 — Unique Code Theft/Guessing
Hash at rest, high entropy, reissue/revoke, rate limit, no logs.

### T3 — Broken Object-Level Authorization
Central policy service, scoped repository/query, negative tests, no client trust.

### T4 — Bidan Privilege Escalation
Bidan detail endpoints server-denied; serializations exclude K1–K6 detail.

### T5 — Puskesmas/Super Admin Misuse
Audit critical actions; Super Admin no routine health access; optional break-glass.

### T6 — Reminder Race/Duplicate
Transactional confirmation + suppression, idempotency keys, unique cycle/fallback constraints.

### T7 — `wa.me` Privacy Leakage
URL text minimized: first name if approved, K code, date/location/contact; never NIK/diagnosis/lab/risk category. Do not persist full URL where avoidable.

### T8 — False Delivery Semantics
Data model has no `SENT/DELIVERED/READ/FAILED` provider state for `wa.me`; UI copy and tests enforce this.

### T9 — WebView Navigation/XSS
Trusted origin allowlist, external navigation handling, CSP, output encoding, secure cookie/token bridge, no arbitrary JS interface.

### T10 — Injection/CSRF
Schema validation, parameterized ORM, CSRF control if cookie auth, same-site policy, content sanitization.

### T11 — Availability Abuse
Rate limiting, worker leases, DB protection, health/readiness, alerting.

## 4. Authentication Controls

### Staff
Salted scrypt (`N=2^17, r=8, p=1`), opaque random access/refresh credentials, HMAC-only token persistence,
single-use refresh rotation, revocable server sessions, generic credential errors, and persistent per-account
lockout are implemented. Exact network/edge throttling policy remains `PROPOSED` pending the pilot security
profile. The staff Web uses a same-origin BFF: access and refresh credentials are held only in `HttpOnly`,
`SameSite=Strict`, path-scoped cookies (`Secure` in production), never returned in a browser-readable body, and
never stored in local/session storage. Login/logout mutations require an exact trusted `Origin`; session identity
and refresh responses are schema-validated before rendering. MFA remains `PROPOSED` for privileged
Puskesmas/Super Admin.

### Bumil
Name + unique code; code is authenticator. The implemented staff issuance format is `ANC-XXXX-XXXX-XXXX-XXXX`: 16 random unambiguous Base32 symbols (80 bits entropy) protected at rest by salted scrypt `N=2^17, r=8, p=1`. Plaintext is returned once, never persisted or logged, and is unavailable on idempotency replay. A domain-separated HMAC provides exact credential lookup without weakening the scrypt verifier. Name comparison uses NFKC/space/case normalization and constant-time digest comparison.

Successful validation issues a 256-bit opaque `anc_mt_` bearer with a configurable 30-day default lifetime;
PostgreSQL stores only its keyed HMAC. Each own-only request rechecks session expiry/revocation, active
credential, active health center, and active pregnancy. Logout revokes the current session; staff
reissue/revoke invalidates all active sessions for the old credential. Mother bearers are not accepted by staff
guards. Private responses are non-cacheable and the own-identity DTO excludes NIK, address, phone, and
health-center details.

Wrong name/code, malformed code, revoked credential, inactive organization, and inactive pregnancy return the
same generic `401`. Durable application throttling stores HMAC buckets only: defaults are 10 failures/IP and 5
failures/code per 15-minute window, followed by a 15-minute block. Successful authentication clears only its
code bucket, preserving IP abuse history. Edge throttling remains an additional pilot control.

## 5. Authorization Controls

Role + scope + operation + milestone code + resource ownership. Puskesmas superset Bidan. Bumil never confirm. Super Admin denied health data default.

ANC plan management uses a second governance boundary: Puskesmas may create a complete draft, but approval and
activation require an active staff account explicitly flagged as `clinical_program_owner`. The flag defaults to
false. Synthetic plans are database-constrained to `DRAFT`, are not production-eligible, and the application only
permits their assignment outside production.

## 6. Encryption and Secret Management

TLS in transit. Secrets/environment variables never committed. DB/storage encryption capability enabled where hosting supports it. FCM service credentials in secret store. NIK must use protected/encrypted persistence appropriate to the deployment; phone/token fields may also require application/DB encryption based on threat review. NIK must never appear in application logs, push payloads, `wa.me` URLs, analytics payloads, or generic audit metadata.

## 7. Privacy Requirements

Data minimization, purpose/consent, privacy notice, retention/deletion policy before production, vendor register, audit access. NIK is now an explicitly required registration field by product decision; collection purpose, authorized viewers, masking rules, retention, correction, and deletion/restriction handling must be documented before production. The registry persists NIK only as versioned AES-256-GCM ciphertext under `NIK_ENCRYPTION_KEY`; it is never a primary key, audit metadata value, log value, or standard registration response field. Key rotation requires a reviewed decrypt-and-re-encrypt migration before an old key can be retired.

## 8. Notification Safety

Push lock-screen text generic. `wa.me` template must pass allowlist. Server chooses target/template; client cannot send arbitrary phone/message through backend link endpoint.

## 9. Audit Logging

Append-only application access. Record actor, resource, action, timestamp, safe metadata. Do not log access code, session token, raw K1–K6 result payload, full sensitive message.

Phase 1 implements an allowlisted/redacted metadata service and a PostgreSQL trigger that rejects update or
delete with SQLSTATE `55000`. Authentication, session, staff, organization, assignment, mother credential, and
mother authentication security actions use this service; later domain tasks must wire confirmation/validation
events through the same boundary. Public mother failures contain only a generic reason and no actor/resource ID;
successful access/logout use the `BUMIL` actor type without recording the code, name input, source IP, or token.

ANC plan draft creation, approval, and activation are audited with plan/version identifiers and a bounded approval
reference. Approval signatures or source documents must remain in separately controlled storage, not in this public repository.

## 9.1 Idempotency Metadata

The shared coordinator never persists request/response payloads. It stores a keyed HMAC fingerprint and a
domain resource reference so duplicate requests can be detected without adding NIK, clinical fields, or
credentials to coordination storage. Same-key/different-request reuse is rejected rather than replayed.

## 10. Secure Development

Dependency scanning, secret scanning, code review, migrations reviewed, no production patient data in dev/test, SAST/DAST where available.

## 11. Security Testing Checklist

- auth brute force/enumeration;
- cross-Bumil/cross-area object access;
- Bidan writing K1–K6 detail;
- Bumil confirming visit;
- Puskesmas superset permission;
- WebView untrusted navigation;
- malicious `wa.me` template/phone input;
- XSS/CSRF/injection;
- race confirmation vs scheduler;
- log/URL sensitive leakage.

## 12. Incident Triggers

Unexpected cross-scope read, credential exposure, sensitive logs/URLs, repeated false reminders after confirmation, unauthorized program status change, abnormal fallback generation.

## 13. Residual Risks

`wa.me` URL can remain in user/browser history; mitigate content minimization. Server-centric architecture means server outage blocks clients; operational availability is required. Exact Indonesian privacy/legal requirements must be reviewed by qualified owner before production.
