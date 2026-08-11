# REST API Contract

> **Project:** Sistem Pengingat ANC Ibu Hamil  
> **Document ID:** DOC-API  
> **Version:** 1.1.0  
> **Status:** Review  
> **Owner:** Backend Lead  
> **Last Updated:** 2026-08-10  
> **Depends On:** DOC-SRS, DOC-ERD, DOC-PERMISSION

## 1. Principles

Base path `/api/v1`. Server owns business rules. Client-provided derived fields (trimester, authoritative milestone status, allowed facility, program predicate) are ignored/rejected. UUID resource IDs. Canonical error envelope. Mutations use idempotency where duplicate action is harmful.

## 2. Authentication

### Staff
Revocable staff session/token; role+scope checked per operation.

### Bumil
Name + unique code validation creates an opaque, revocable, own-only mother session. The database stores
only salted scrypt code verifiers plus keyed HMAC lookup/session hashes; raw codes and bearer tokens are never
persisted. There is no mother refresh endpoint in MVP.

### Worker
Service identity with minimum scheduled-job permissions.

## 3. Canonical Error Envelope

```json
{
  "error": {
    "code": "FORBIDDEN",
    "message": "Anda tidak memiliki akses untuk tindakan ini.",
    "request_id": "req_uuid",
    "details": null
  }
}
```

Do not reveal whether an out-of-scope mother exists.

## 4. Pagination

List endpoints use `cursor`, `limit` (server max), `sort`, and allowlisted filters.

## 5. Endpoint Inventory

### Authentication / Staff

| Operation ID | Method | Path | Actor |
|---|---|---|---|
| API-AUTH-001 | POST | `/staff/auth/login` | Staff |
| API-AUTH-002 | POST | `/staff/auth/refresh` | Staff |
| API-AUTH-003 | POST | `/staff/auth/logout` | Staff |
| API-AUTH-004 | GET | `/staff/me` | Staff |
| API-AUTH-005 | POST | `/staff/sessions/revoke` | Puskesmas/self policy |

#### Staff Web BFF Boundary

The browser calls same-origin `/api/staff-session/login`, `/api/staff-session/me`, and
`/api/staff-session/logout`. These are Web adapter routes, not additional public domain endpoints. They map to
`API-AUTH-001..004`, keep opaque credentials in `HttpOnly` cookies, rotate both cookies after refresh, and return
only the validated staff identity or a safe canonical error. Login/logout reject missing or mismatched origins.

### Organization / Staff Scope

| Operation ID | Method | Path | Actor |
|---|---|---|---|
| API-ORG-001 | GET | `/staff/organization/villages` | Puskesmas |
| API-ORG-002 | POST | `/staff/organization/villages` | Puskesmas |
| API-ORG-003 | GET | `/staff/organization/facilities` | Puskesmas |
| API-ORG-004 | POST | `/staff/organization/facilities` | Puskesmas |
| API-STAFF-001 | GET | `/staff/users` | Puskesmas |
| API-STAFF-002 | POST | `/staff/users` | Puskesmas; creates Bidan only |
| API-STAFF-003 | PATCH | `/staff/users/{id}/status` | Puskesmas, same center |
| API-STAFF-004 | POST | `/staff/assignments` | Puskesmas, same center |
| API-STAFF-005 | DELETE | `/staff/assignments/{id}` | Puskesmas, same center |

### Bumil Private Access

| Operation ID | Method | Path | Actor |
|---|---|---|---|
| API-MACCESS-001 | POST | `/mother-access/validate` | Public throttled |
| API-MACCESS-002 | POST | `/mother-access/logout` | Bumil |
| API-MACCESS-003 | POST | `/mothers/{id}/access-code/reissue` | Puskesmas, same center |
| API-MACCESS-004 | GET | `/mother/me` | Bumil |
| API-MACCESS-005 | GET | `/mother/me/dashboard` | Bumil |
| API-MACCESS-006 | POST | `/mothers/{id}/access-code/revoke` | Puskesmas, same center |
| API-DEVICE-001 | PUT | `/mother/me/devices/android` | Bumil WebView |

#### `API-MACCESS-001/002/004` — Validate, Read Own Identity, and Logout

`API-MACCESS-001` accepts a name and the response-only code handed off by Puskesmas. Name comparison is
normalized and constant-time; code lookup uses a keyed HMAC before the salted scrypt verifier is checked.

```json
{
  "full_name": "Siti Aminah",
  "access_code": "ANC-XXXX-XXXX-XXXX-XXXX"
}
```

Successful validation returns a 30-day opaque bearer session. The TTL is configurable through
`MOTHER_SESSION_TTL_DAYS`; every protected request revalidates the session, active credential, active health
center, and active pregnancy in PostgreSQL.

```json
{
  "token_type": "Bearer",
  "access_token": "anc_mt_<opaque-random-token>",
  "expires_at": "2026-09-09T09:00:00.000Z"
}
```

Wrong name, unknown/malformed code, revoked credential, inactive health center, and missing active pregnancy
all return the same HTTP `401` shape without identifying which condition failed:

```json
{
  "error": {
    "code": "INVALID_CREDENTIALS",
    "message": "Kredensial tidak valid.",
    "request_id": "req_uuid",
    "details": null
  }
}
```

`API-MACCESS-004` returns only `id`, `display_name`, `active_pregnancy_id`, `session_id`, and
`session_expires_at`; it does not return NIK, address, phone, health-center data, or another mother's data.
`API-MACCESS-002` revokes the current session and returns HTTP `204`. Validation and mother-session responses
use `Cache-Control: private, no-store` and `Pragma: no-cache`. A mother bearer is rejected by staff guards and
cannot call pregnancy/visit mutation endpoints.

#### `API-MACCESS-003/006` — Issue, Reissue, and Revoke Access Code

Both staff mutations require a UUID idempotency key and a 3–200 character operational reason:

```json
{
  "idempotency_key": "client-generated-uuid",
  "reason": "Kode sebelumnya hilang"
}
```

`API-MACCESS-003` creates the first credential or atomically revokes the latest active credential and all active mother sessions before creating its replacement. The code uses the display format `ANC-XXXX-XXXX-XXXX-XXXX`, with 16 random symbols from an unambiguous Base32 alphabet (80 bits entropy). Persistence contains a salted scrypt verifier and a domain-separated keyed HMAC lookup value, never plaintext.

```json
{
  "id": "credential-uuid",
  "mother_id": "mother-uuid",
  "issuance_type": "ISSUED",
  "status": "ACTIVE",
  "issued_at": "2026-08-10T09:00:00.000Z",
  "one_time_code": "ANC-XXXX-XXXX-XXXX-XXXX",
  "code_delivery": "DISPLAY_ONCE"
}
```

The plaintext is returned only by the first successful execution. An idempotency replay returns the same immutable credential snapshot with `one_time_code: null` and `code_delivery: "NOT_AVAILABLE_ON_REPLAY"`; a lost response requires a new reissue request and key. `API-MACCESS-006` revokes the active credential and active mother sessions atomically and returns the immutable revoked snapshot. Bidan, Super Admin routine access, cross-center targets, and issue/reissue without an active pregnancy fail closed.

### Registry

| Operation ID | Method | Path | Actor |
|---|---|---|---|
| API-MOTHER-001 | POST | `/mothers` | Puskesmas |
| API-MOTHER-002 | GET | `/mothers` | Bidan scoped/Puskesmas |
| API-MOTHER-003 | GET | `/mothers/{id}` | Bidan scoped/Puskesmas |
| API-MOTHER-004 | PATCH | `/mothers/{id}` | Puskesmas |
| API-PREG-001 | POST | `/mothers/{id}/pregnancies` | Puskesmas |
| API-PREG-002 | PATCH | `/pregnancies/{id}` | Puskesmas |
| API-PREG-003 | POST | `/pregnancies/{id}/close` | Puskesmas |
| API-ASSIGN-001 | PUT | `/pregnancies/{id}/bidan-assignment` | Puskesmas |

#### `API-MOTHER-001` — Register Bumil

Registration request wajib mengandung lima data inti. Endpoint ini membuat `mother` dan initial active `pregnancy` dalam satu transaction.

```json
{
  "idempotency_key": "client-generated-uuid",
  "full_name": "Siti Aminah",
  "nik": "INPUT_NIK",
  "address": "Alamat lengkap Bumil",
  "phone_number": "08xxxxxxxxxx",
  "pregnancy_start_date": "2026-05-01",
  "consent": {
    "notification_allowed": true
  }
}
```

Server behavior:
- validasi semua lima field wajib;
- normalize `phone_number` menjadi `phone_normalized`;
- protect/encrypt NIK sebelum persistence;
- map `pregnancy_start_date` ke current `dating_date` dengan `dating_basis = PREGNANCY_START_DATE`;
- create mother + pregnancy + consent secara atomik;
- gunakan `idempotency_key` UUID per attempt; request body tidak dipersist, hanya fingerprint HMAC dan referensi resource;
- response tidak mengembalikan NIK lengkap kecuali endpoint/role memang memerlukan dan policy mengizinkan.

Contoh validation error:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Data pendaftaran belum lengkap.",
    "fields": {
      "nik": "required",
      "pregnancy_start_date": "required"
    }
  }
}
```

#### `API-PREG-001` to `API-PREG-003` - Pregnancy Lifecycle

Create a new active pregnancy for an existing mother after the previous pregnancy is closed:

```json
{
  "idempotency_key": "client-generated-uuid",
  "pregnancy_start_date": "2026-06-01"
}
```

Revise the approved dating input. The previous and revised values are retained in append-only history:

```json
{
  "idempotency_key": "client-generated-uuid",
  "pregnancy_start_date": "2026-05-28",
  "reason": "Koreksi input awal"
}
```

Close an active pregnancy:

```json
{
  "idempotency_key": "client-generated-uuid",
  "reason": "Penutupan administratif"
}
```

All three mutations are Puskesmas-only, same-health-center scoped, and idempotent. The server enforces at most
one active pregnancy per mother. Dating revision and lifecycle event snapshots are append-only. This slice
does not accept client-derived HPL, gestational age, trimester, milestone status, or K1-K8 dates. Full
milestone/reminder cancellation on close remains the owning responsibility of `TASK-P2-008`.

Errors include `ACTIVE_PREGNANCY_EXISTS` (`409`), `PREGNANCY_NOT_ACTIVE` (`409`),
`PREGNANCY_DATING_UNCHANGED` (`409`), future dating input (`422`), and safe scoped denial (`403`).

### ANC Plan / Milestones

| Operation ID | Method | Path | Actor |
|---|---|---|---|
| API-ANC-001 | GET | `/anc-plan/active` | Staff |
| API-ANC-002 | POST | `/anc-plan/versions` | Puskesmas program permission |
| API-ANC-003 | POST | `/anc-plan/versions/{id}/approve` | Program owner |
| API-ANC-004 | POST | `/anc-plan/versions/{id}/activate` | Program owner |
| API-MILESTONE-001 | GET | `/pregnancies/{id}/milestones` | Scoped staff; Bumil-own exposure deferred to TASK-P2-015 |
| API-MILESTONE-002 | GET | `/pregnancies/{id}/milestones/next` | Scoped staff/Bumil own |
| API-MILESTONE-003 | PATCH | `/pregnancies/{id}/milestones/{code}/due-date` | Puskesmas |
| API-MILESTONE-004 | GET | `/pregnancies/{id}/progress` | Scoped |

`POST /anc-plan/versions` creates only a `CLINICAL` `DRAFT`. It requires an idempotency key, a bounded
`source_reference`, and exactly one unique rule for every code K1–K8. Target weeks remain configuration input;
the API does not provide or infer production clinical values. Structural policy is always server-enforced:
K1/K4/K5 are ANC at Puskesmas only, K2/K3/K6/K7 are ANC with a configured flexible allowlist, and K8 is a
delivery milestone limited to PONED/RS.

```json
{
  "idempotency_key": "client-generated-uuid",
  "source_reference": "controlled-document-reference",
  "rules": [
    {
      "code": "K1",
      "trimester_label": "approved-label",
      "target_week_start": null,
      "target_week_end": null,
      "milestone_category": "ANC",
      "required_facility_policy": "PUSKESMAS_REQUIRED",
      "allowed_facility_types": ["PUSKESMAS"],
      "reminder_enabled": true
    }
  ]
}
```

The example shows one incomplete draft rule shape only; a valid request must contain all eight rules, and approval
requires the clinically approved K1–K7 week windows. `POST .../{id}/approve` accepts `idempotency_key`,
`approval_reference`, and `effective_from`; `POST .../{id}/activate` accepts `idempotency_key` and rejects an
approved plan before its effective date. Both operations require `clinical_program_owner=true` and create audit
events. Signatures or approval files are not accepted by these endpoints.

`SYNTHETIC` plans can only be inserted by controlled development/test setup, remain `DRAFT`, and return
`production_eligible=false`. Runtime production never assigns them. A pregnancy stores the selected plan version
and receives exactly eight immutable rule snapshots; `due_at` stays null until the owning schedule/calculation
tasks populate it.

Implemented errors include `ANC_PLAN_NOT_AVAILABLE` (`404`), `ANC_PLAN_INVALID_TRANSITION` (`409`),
`ANC_PLAN_NOT_EFFECTIVE` (`409`), `ANC_PLAN_RULES_INCOMPLETE` (`422`),
`PREGNANCY_MILESTONES_NOT_READY` (`409`), and scope-safe `FORBIDDEN` (`403`).

### Visit Confirmation / Detail

| Operation ID | Method | Path | Actor |
|---|---|---|---|
| API-VISIT-001 | POST | `/milestones/{id}/confirm` | Bidan selected K / Puskesmas |
| API-VISIT-002 | POST | `/milestones/{id}/confirmation-correction` | Puskesmas |
| API-VISIT-003 | GET | `/milestones/{id}/record` | Puskesmas; limited summary staff |
| API-VISIT-004 | PUT | `/milestones/{id}/record` | Puskesmas; K1–K6 |
| API-VISIT-005 | POST | `/milestones/{id}/record/validate` | Puskesmas |
| API-VISIT-006 | POST | `/milestones/{id}/record/reopen` | Puskesmas with reason |

`POST /milestones/{id}/confirm` request:
```json
{
  "occurred_on": "2026-08-08",
  "facility_id": "uuid",
  "idempotency_key": "client-generated-uuid"
}
```
No lab/USG/clinical detail in Bidan confirmation.

### Reminder / `wa.me`

| Operation ID | Method | Path | Actor |
|---|---|---|---|
| API-REM-001 | GET | `/reminders/fallback-actions` | Bidan scoped/Puskesmas aggregate |
| API-REM-002 | GET | `/reminders/fallback-actions/{id}` | Scoped staff |
| API-REM-003 | POST | `/reminders/fallback-actions/{id}/wa-link` | Scoped staff |
| API-REM-004 | POST | `/reminders/fallback-actions/{id}/mark-opened` | Web/WebView optional telemetry |
| API-REM-005 | POST | `/reminders/fallback-actions/{id}/resolve` | Scoped staff |
| API-REM-006 | POST | `/reminders/fallback-actions/{id}/unreachable` | Scoped staff |
| API-REM-007 | GET | `/reminders/summary` | Puskesmas |
| API-REM-008 | GET | `/reminders/{milestoneId}/history` | Scoped staff |

`POST /reminders/fallback-actions/{id}/wa-link` takes **no arbitrary target/message**. Server selects mother phone and approved minimal template.

Response:
```json
{
  "action_id": "uuid",
  "status": "LINK_GENERATED",
  "wa_url": "https://wa.me/62812...?text=...",
  "delivery_status": "UNKNOWN"
}
```

`delivery_status` remains `UNKNOWN` for `wa.me`.

### Dashboard

| Operation ID | Method | Path | Actor |
|---|---|---|---|
| API-DASH-001 | GET | `/dashboard/puskesmas` | Puskesmas |
| API-DASH-002 | GET | `/dashboard/bidan` | Bidan |
| API-DASH-003 | GET | `/dashboard/bumil` | Bumil |

### Program Assessment

| Operation ID | Method | Path | Actor |
|---|---|---|---|
| API-PROGRAM-001 | GET | `/pregnancies/{id}/program-status` | Puskesmas / approved Bumil subset |
| API-PROGRAM-002 | POST | `/pregnancies/{id}/program-status/recalculate` | Puskesmas/system |
| API-PROGRAM-003 | GET | `/pregnancies/{id}/program-status/history` | Puskesmas |

## 6. Validation Rules

- `API-MOTHER-001` requires `full_name`, `nik`, `address`, `phone_number`, and `pregnancy_start_date`.
- Empty/whitespace-only values are invalid; exact NIK format policy may be configured/validated separately without exposing NIK in error logs.
- `pregnancy_start_date` must be a valid date accepted by server dating policy; client must not calculate authoritative gestational state.
- Phone normalized server-side; `wa.me` number contains digits only and no `+`.
- `wa.me` template placeholders use allowlist.
- K confirm authorization depends on actor role + code + resource scope.
- Facility validated against milestone rule snapshot.
- K1–K6 record endpoints reject K7/K8.
- Client cannot set program status directly.
- Bumil cannot call any confirm/record endpoint.

## 7. Idempotency and Concurrency

Confirmation, pregnancy close, reminder cycle creation, WA fallback creation, and program assessment use idempotency/unique constraints and transactional checks. Confirmation and reminder scheduling must serialize sufficiently to guarantee no new active reminder after committed confirmation.

Shared server behavior:

- mutation contracts use a client-generated UUID `idempotency_key` where duplicate action is harmful;
- uniqueness scope is actor + operation + idempotency key;
- PostgreSQL stores only a keyed HMAC request fingerprint and the resulting resource type/UUID—never request or response payloads;
- an identical replay reconstructs the response from the domain resource;
- reuse for a different request returns canonical HTTP `409` with code `IDEMPOTENCY_KEY_REUSED`;
- same-key requests serialize through a transaction-scoped advisory lock; serializable/deadlock failures (`40001`/`40P01`) retry at most three times;
- domain tables retain their own logical unique constraints; the shared coordinator does not replace domain invariants.

## 8. Retry Semantics

Push retry occurs internally only for classified retryable provider/transport errors. `PROPOSED` default max 3 attempts; config-controlled. `wa.me` has **no provider retry** because server never sends the chat.

## 9. Rate Limits

`/mother-access/validate` has durable application throttling with domain-separated keyed-HMAC buckets, so raw
source IPs and codes are not stored. Defaults are 10 failures per IP and 5 failures per code within 15 minutes;
reaching either threshold blocks matching attempts for 15 minutes and returns HTTP `429` with a positive
`retry_after_seconds`. Values are configurable through the `MOTHER_ACCESS_*` environment variables. Successful
validation clears the matching code bucket but not accumulated IP failures. Edge/network limiting for mother
access, staff login, code reissue/revoke, and WA-link generation remains defense-in-depth to calibrate during the
pilot security/load profile.

## 10. Deprecation

Old provider/webhook WhatsApp endpoints and generic mother self-completion endpoints are removed from v1 contract. If already implemented externally, publish a migration note before deployment.

## 11. OpenAPI

`openapi.yaml` remains Deferred until payload review is approved. `API.md` is authoritative contract meanwhile.
