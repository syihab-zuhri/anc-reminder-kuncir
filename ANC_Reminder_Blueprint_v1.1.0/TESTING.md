# Verification Strategy

> **Project:** Sistem Pengingat ANC Ibu Hamil  
> **Document ID:** DOC-TESTING  
> **Version:** 1.1.0  
> **Status:** Review  
> **Owner:** QA Lead  
> **Last Updated:** 2026-08-08  
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
| TEST-REG-003 | NIK is not exposed in logs, notification payloads, `wa.me`, or generic audit metadata | Security |
| TEST-REG-004 | Phone normalization and pregnancy-start persistence match server contract | Integration |
| TEST-ANC-001 | K1/K4/K5 require Puskesmas | Unit/integration |
| TEST-ANC-002 | K2/K3/K6/K7 allowed by configured facility list | Unit |
| TEST-ANC-003 | K8 category/facility PONED/RS | Unit |
| TEST-VISIT-001 | Bidan confirms K3 without detail form | E2E |
| TEST-VISIT-002 | Bidan cannot edit K1–K6 detail | Security |
| TEST-VISIT-003 | Puskesmas can perform Bidan confirmation | Permission |
| TEST-VISIT-004 | Confirmation suppresses reminder atomically | Concurrency |
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
