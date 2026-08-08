# Security, Privacy & Threat Model

> **Project:** Sistem Pengingat ANC Ibu Hamil  
> **Document ID:** DOC-SECURITY  
> **Version:** 1.1.0  
> **Status:** Review  
> **Owner:** Security Reviewer  
> **Last Updated:** 2026-08-08  
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
lockout are implemented. Network/edge throttling remains in `TASK-P1-006`. MFA remains `PROPOSED` for
privileged Puskesmas/Super Admin.

### Bumil
Name + unique code; code is authenticator. Store only hash. Reissue revokes old credential. Response failure is generic.

## 5. Authorization Controls

Role + scope + operation + milestone code + resource ownership. Puskesmas superset Bidan. Bumil never confirm. Super Admin denied health data default.

## 6. Encryption and Secret Management

TLS in transit. Secrets/environment variables never committed. DB/storage encryption capability enabled where hosting supports it. FCM service credentials in secret store. NIK must use protected/encrypted persistence appropriate to the deployment; phone/token fields may also require application/DB encryption based on threat review. NIK must never appear in application logs, push payloads, `wa.me` URLs, analytics payloads, or generic audit metadata.

## 7. Privacy Requirements

Data minimization, purpose/consent, privacy notice, retention/deletion policy before production, vendor register, audit access. NIK is now an explicitly required registration field by product decision; collection purpose, authorized viewers, masking rules, retention, correction, and deletion/restriction handling must be documented before production.

## 8. Notification Safety

Push lock-screen text generic. `wa.me` template must pass allowlist. Server chooses target/template; client cannot send arbitrary phone/message through backend link endpoint.

## 9. Audit Logging

Append-only application access. Record actor, resource, action, timestamp, safe metadata. Do not log access code, session token, raw K1–K6 result payload, full sensitive message.

Phase 1 implements an allowlisted/redacted metadata service and a PostgreSQL trigger that rejects update or
delete with SQLSTATE `55000`. Authentication, session, staff, organization, and assignment security actions use
this service; later domain tasks must wire confirmation/validation events through the same boundary.

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
