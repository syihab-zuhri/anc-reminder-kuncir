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
Name + unique code validation creates restricted mother session. Code hash only at rest.

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

#### `API-MACCESS-003/006` — Issue, Reissue, and Revoke Access Code

Both staff mutations require a UUID idempotency key and a 3–200 character operational reason:

```json
{
  "idempotency_key": "client-generated-uuid",
  "reason": "Kode sebelumnya hilang"
}
```

`API-MACCESS-003` creates the first credential or atomically revokes the latest active credential and all active mother sessions before creating its replacement. The code uses the display format `ANC-XXXX-XXXX-XXXX-XXXX`, with 16 random symbols from an unambiguous Base32 alphabet (80 bits entropy). Only its salted scrypt verifier is persisted.

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

The plaintext is returned only by the first successful execution. An idempotency replay returns the same immutable credential snapshot with `one_time_code: null` and `code_delivery: "NOT_AVAILABLE_ON_REPLAY"`; a lost response requires a new reissue request and key. `API-MACCESS-006` revokes the active credential and active mother sessions atomically and returns the immutable revoked snapshot. Bidan, Super Admin routine access, cross-center targets, and issue/reissue without an active pregnancy fail closed. Public validation, throttling, and restricted mother sessions remain owned by `TASK-P2-004`.

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
| API-MILESTONE-001 | GET | `/pregnancies/{id}/milestones` | Scoped staff/Bumil own |
| API-MILESTONE-002 | GET | `/pregnancies/{id}/milestones/next` | Scoped staff/Bumil own |
| API-MILESTONE-003 | PATCH | `/pregnancies/{id}/milestones/{code}/due-date` | Puskesmas |
| API-MILESTONE-004 | GET | `/pregnancies/{id}/progress` | Scoped |

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

## 9. Rate Limits (`PROPOSED`)

Strict on `/mother-access/validate`, staff login, code reissue/revoke, and WA-link generation. Exact values set after pilot/security load test. Staff code mutations already use UUID idempotency and transactional row locking; edge rate-limit values remain part of the pilot security profile.

## 10. Deprecation

Old provider/webhook WhatsApp endpoints and generic mother self-completion endpoints are removed from v1 contract. If already implemented externally, publish a migration note before deployment.

## 11. OpenAPI

`openapi.yaml` remains Deferred until payload review is approved. `API.md` is authoritative contract meanwhile.
