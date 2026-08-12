# Verification Strategy

> **Project:** Sistem Pengingat ANC Ibu Hamil  
> **Document ID:** DOC-TESTING  
> **Version:** 1.1.0  
> **Status:** Review  
> **Owner:** QA Lead  
> **Last Updated:** 2026-08-12  
> **Depends On:** DOC-SRS, PRD documents, DOC-API

## 1. Strategy

Unit for rule engines; integration for DB transactions/scheduler; contract for API/FCM adapters; E2E for role journeys; security/accessibility/load as release gates.

## 2. Environments

Local synthetic data → CI ephemeral DB → staging with synthetic/pilot-approved data → production. No real patient data in CI/dev.

## 3. Critical P0 Scenarios

| Test ID | Scenario | Type |
|---|---|---|
| TEST-STAFF-WEB-001 | Login body exposes identity only; access/refresh remain in strict HttpOnly cookies | Security integration/E2E |
| TEST-STAFF-WEB-002 | Invalid access credential rotates through refresh cookie; replayed/expired session returns 401 | Security E2E |
| TEST-STAFF-WEB-003 | Logout revokes server session, clears both cookies, and shows explicit safe notice | E2E |
| TEST-STAFF-WEB-004 | Login/workspace/403 states are responsive, keyboard-readable, and WCAG A/AA audited | Accessibility E2E |
| TEST-AUTH-001 | Bidan denied out-of-scope mother | Security E2E |
| TEST-AUTH-002 | Bumil name+code anti-enumeration | Security |
| TEST-REG-001 | Registration rejects missing name/NIK/address/phone/pregnancy start | E2E |
| TEST-REG-002 | Valid five-field registration creates mother + active pregnancy atomically | Integration |
| TEST-REG-003 | Dating correction retains immutable previous/revised values and replays once | Integration/DB |
| TEST-REG-004 | Active pregnancy rejects a duplicate; close permits exactly one replacement | Integration/Concurrency |
| TEST-REG-005 | Bidan and cross-center pregnancy mutations fail without resource leakage | Security |
| TEST-REG-006 | NIK is not exposed in logs, notification payloads, `wa.me`, or generic audit metadata | Security |
| TEST-REG-007 | Phone normalization and pregnancy-start persistence match server contract | Integration |
| TEST-REG-008 | Access code is displayed once, stored only as salted scrypt verifier plus keyed-HMAC lookup, and absent on idempotency replay | Integration/DB |
| TEST-REG-009 | Reissue/revoke preserves one active credential, invalidates sessions, and retains append-only history | Integration/Concurrency |
| TEST-REG-010 | Bidan, cross-center, and inactive-pregnancy issuance fail closed | Security |
| TEST-REG-011 | Close atomically cancels every unfinished milestone and unresolved reminder cycle while preserving terminal states | API/PostgreSQL |
| TEST-REG-012 | Exact replay and concurrent double-close produce one lifecycle event, one cancellation set, and one audit | Idempotency/Concurrency |
| TEST-REG-013 | Cancellation history rejects mutation; active reminder writes after close are rejected by the database guard | PostgreSQL/Security |
| TEST-MACCESS-001 | Wrong name/code, malformed/revoked credential, inactive center, and inactive pregnancy return the same generic 401 | Security integration |
| TEST-MACCESS-002 | Valid name/code creates an HMAC-only opaque session and `/mother/me` exposes minimum own-only identity data | Integration/DB |
| TEST-MACCESS-003 | Mother bearer is denied at staff mutation boundaries; logout/reissue/revoke invalidates it immediately | Security E2E |
| TEST-MACCESS-004 | Durable HMAC-only IP/code buckets enforce configurable thresholds, return safe 429 retry data, and recover after block expiry | Security/clock/DB |
| TEST-ANC-001 | K1/K4/K5 require Puskesmas | Unit/integration |
| TEST-ANC-002 | K2/K3/K6/K7 allowed by configured facility list | Unit |
| TEST-ANC-003 | K8 category/facility PONED/RS | Unit |
| TEST-ANC-004 | Gestational completed weeks/days use server timezone calendar boundaries | Unit/clock |
| TEST-ANC-005 | Rule window or explicit due date derives UPCOMING/DUE/OVERDUE without client calculation | Unit/API |
| TEST-ANC-006 | Terminal milestone states remain terminal; closed pregnancy caps age at `closed_at` and has no next/reminder eligibility | Unit/API |
| TEST-ANC-007 | Dating later than server calculation date fails closed | Unit/API |
| TEST-ANC-008 | Dating basis without approved age-offset semantics fails closed | Unit/API |
| TEST-SCHEDULE-001 | First explicit schedule stores the local date, timezone snapshot, and matching UTC instant | Contract/API/DB |
| TEST-SCHEDULE-002 | Reschedule requires the exact previous local date and a reason | API/DB |
| TEST-SCHEDULE-003 | Two concurrent writers from the same expected date produce exactly one winner and one conflict | Concurrency/DB |
| TEST-SCHEDULE-004 | Closed pregnancy and terminal milestone states reject schedule mutation | API/security |
| TEST-SCHEDULE-005 | Idempotency replay returns the immutable original event without duplicate event/audit | API/DB |
| TEST-VISIT-001 | Assigned Bidan confirms K3 with only date/facility/idempotency input; validation status remains independent | Contract/API/PostgreSQL |
| TEST-VISIT-002 | Only same-center Puskesmas can read/write/validate/reopen K1–K6 detail; Bidan/Bumil/Super Admin and K7/K8 fail closed | Security/API |
| TEST-VISIT-003 | Bidan is denied K1/K4/K5/K8 or out-of-scope mothers; Puskesmas inherits confirmation for K1–K8 | Permission/API |
| TEST-VISIT-004 | Confirmation suppresses reminder atomically | Concurrency |
| TEST-VISIT-005 | Exact replay and same-fact logical duplicate return the initial confirmation without duplicate history/audit | API/DB |
| TEST-VISIT-006 | Different confirmation facts require the separately authorized Puskesmas correction workflow | API/security |
| TEST-VISIT-007 | Closed pregnancy, terminal milestone, future/pre-pregnancy date, inactive/cross-center/disallowed facility fail closed | API/security |
| TEST-VISIT-008 | Two concurrent identical confirmations create one history/audit and return one immutable identity | Concurrency/PostgreSQL |
| TEST-VISIT-009 | Confirmation history rejects update/delete and confirmed timeline is immediately not reminder-eligible | PostgreSQL/API |
| TEST-RECORD-001 | First save and later saves produce bounded versioned append-only revisions without hardcoded unapproved fields | Contract/API/DB |
| TEST-RECORD-002 | Exact replay returns immutable save response without duplicate revision/audit | API/DB |
| TEST-RECORD-003 | Two writers using one expected revision produce exactly one success and one revision conflict | Concurrency/PostgreSQL |
| TEST-RECORD-004 | Validation requires confirmed visit, exact revision, and explicit Puskesmas attestation; record/milestone states stay synchronized | API/DB |
| TEST-RECORD-005 | Validated record rejects edit until reasoned reopen; reopen preserves validated revision and next edit creates a new revision | API/DB |
| TEST-RECORD-006 | Logical duplicate validate/reopen does not duplicate immutable event/audit | API/DB |
| TEST-RECORD-007 | Closed pregnancy, terminal milestone, missing record, unsafe/empty/oversized payload fail closed | Contract/API/security |
| TEST-RECORD-008 | Revision and validation-event updates/deletes are rejected; generic audit contains no clinical payload | PostgreSQL/security |
| TEST-NOTIF-001 | One logical reminder per 3-day window | Clock/concurrency |
| TEST-NOTIF-002 | Push retryable failures retry under policy | Integration |
| TEST-NOTIF-003 | Terminal/no-device creates single WA fallback | Integration |
| TEST-NOTIF-004 | `wa.me` phone normalization + URL encoding | Unit |
| TEST-NOTIF-005 | `LINK_OPENED` never becomes `SENT` automatically | Contract |
| TEST-NOTIF-006 | Unresolved/unreachable visible to Puskesmas | E2E |
| TEST-PROG-001 | K6 alone does not imply MET when requirements missing | Unit |
| TEST-PROG-002 | Program assessment stores rule version | Integration |
| TEST-CLIENT-001 | Manipulated client-derived K/status rejected/ignored | E2E |
| TEST-WEBVIEW-001 | Session not stored in plain localStorage | Android review |
| TEST-WEBVIEW-002 | Untrusted navigation blocked | Android/security |
| TEST-FAIL-001 | API down shows safe retry state | E2E |

## 4. Provider Contract Tests

FCM adapter: success, retryable, terminal, invalid token. Use provider sandbox/test facilities where available. There is **no WhatsApp provider contract test** for `wa.me`; test URL construction and UI behavior instead.

## 5. Security Tests

OWASP-style authn/authz, injection/XSS/CSRF, object authorization, rate limiting, WebView navigation, URL/log data leakage, credential/session handling.

## 6. Performance Tests (`PROPOSED`)

API p95 ≤1.5s at agreed pilot profile; scheduler 95% ≤15min; measure DB queue contention and fallback dashboard query.

## 7. Accessibility

Keyboard staff flows, focus, labels, semantic status text, screen-reader basic pass, touch target size.

## 8. Coverage Targets

Do not optimize only for percentage. `PROPOSED`: ≥80% domain service line/branch where practical; 100% P0 business rules have explicit tests; 100% authorization matrix critical negatives tested.

## 9. Flaky Test Policy

Quarantine only with owner/expiry; no silently ignored P0 flaky tests.

## 10. Defect Severity

Critical: data exposure/corruption, unauthorized clinical/program change. High: wrong facility/reminder or reminder not suppressed. Medium: recoverable UX/operational issue. Low: cosmetic.

## 11. Release Quality Gates

No Critical/High security defect, P0 traceability covered, scheduler/confirmation race tests pass, no false `wa.me` delivery semantics, backup/restore and smoke tests completed before Gate D.
