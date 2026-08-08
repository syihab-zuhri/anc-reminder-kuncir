# Software Requirements Specification

> **Project:** Sistem Pengingat ANC Ibu Hamil  
> **Document ID:** DOC-SRS  
> **Version:** 1.1.0  
> **Status:** Review  
> **Owner:** Product Owner + Software Architect  
> **Last Updated:** 2026-08-08  
> **Depends On:** DOC-PLANNING

## 1. Product Context and System Boundary

Sistem mengelola registrasi Bumil, milestone ANC K1–K8, reminder administratif, konfirmasi kunjungan, pencatatan program K1–K6, dan program assessment. Sistem **bukan** alat diagnosis dan tidak menggantikan clinical judgment.

### In Scope Systems

- Responsive staff Web.
- Bumil Web experience di Android WebView.
- REST API server.
- PostgreSQL.
- Background scheduler/worker.
- FCM push adapter.
- Server-side `wa.me` link generator.
- Audit/observability.

### External Systems

- Firebase Cloud Messaging.
- WhatsApp app/web yang dibuka melalui `wa.me`; **bukan API integration**.
- Tidak ada clinical-record integration pada MVP.

## 2. Actors

| Actor | Description |
|---|---|
| `BUMIL` | Mengakses data sendiri dengan nama + kode unik |
| `BIDAN` | Petugas scoped ke Bumil/area assignment; konfirmasi sederhana K2/K3/K6/K7 |
| `PUSKESMAS` | Semua kewenangan Bidan + registry, schedule, detail K1–K6, validation, program monitoring |
| `SUPER_ADMIN` | Operator teknis tanpa akses kesehatan rutin |
| `REMINDER_WORKER` | Service identity untuk scheduler dan push |
| `CLINICAL_PROGRAM_OWNER` | Governance actor yang menyetujui rules/content; dapat diwujudkan sebagai permission Puskesmas |

## 3. Functional Requirements

| ID | Requirement | Priority | Source | Dependencies | Verification |
|---|---|---|---|---|---|
| FR-001 | Staff shall authenticate and maintain revocable sessions. | P0 | Existing | None | Integration/security |
| FR-002 | Server shall enforce role and resource scope on every protected operation. | P0 | Existing + user | FR-001 | Negative auth |
| FR-003 | Puskesmas shall manage facilities, areas, Bidan accounts, and assignments within scope. | P0 | User | FR-002 | E2E |
| FR-004 | Puskesmas shall register Bumil with required data: full name, NIK, address, phone number, pregnancy start date, and consent record. | P0 | User 2026-08-08 | FR-002 | E2E |
| FR-005 | Puskesmas shall create/maintain pregnancy lifecycle using the required pregnancy start date as the current approved dating input, with revision history when changed. | P0 | User 2026-08-08 | FR-004 | Integration |
| FR-006 | System shall issue a random unique access code and validate it with Bumil name. | P0 | User | FR-004 | Security/E2E |
| FR-007 | Authorized staff shall revoke/reissue Bumil access code; old code stops working. | P0 | Existing | FR-006 | Integration |
| FR-009 | Puskesmas shall set or confirm milestone target date/rule configuration. | P0 | Existing adapted | FR-029 | E2E |
| FR-015 | Android WebView shall register/refresh FCM token after notification permission. | P0 | Existing | FR-006 | Mobile integration |
| FR-017 | System shall stop future reminder cycles for a milestone after visit confirmation, pregnancy close, or consent withdrawal as applicable. | P0 | User | FR-030, FR-034 | Concurrency |
| FR-018 | System shall record notification consent/preference and source/timestamp. | P0 | Existing | FR-004 | Audit |
| FR-019 | Bumil shall see only own approved summary, K1–K8 progress, next location/date, education, and contacts. | P0 | User | FR-006, FR-029 | Privacy E2E |
| FR-020 | Bidan/Puskesmas shall see due/overdue visits and unresolved reminder fallback within scope; Puskesmas has aggregate visibility. | P0 | User | FR-002, FR-037 | E2E |
| FR-021 | Puskesmas with content permission shall manage approved reminder/education templates. | P1 | Existing | FR-002 | Workflow |
| FR-022 | Critical authentication, confirmation, validation, rule, fallback, and program-status actions shall create audit events. | P0 | Existing | FR-002 | Audit test |
| FR-023 | Super Admin health-data access, if enabled, shall require time-bound break-glass approval/reason and audit. | P1 | Existing | FR-022 | Security E2E |
| FR-024 | Puskesmas shall close pregnancy and suppress future reminders. | P0 | Existing | FR-005 | Integration |
| FR-026 | Puskesmas shall view aggregate visit/reminder reports within scope. | P1 | Existing | FR-002 | Report test |
| FR-028 | Puskesmas may support clinically approved facility override in later release. | P1 | Existing proposed | FR-032 | Workflow |
| FR-029 | Server shall represent a versioned **K1–K8 milestone plan** with trimester/target window, allowed facility types, reminder eligibility, and effective dates. | P0 | User | FR-005 | Unit/integration |
| FR-030 | Bidan shall confirm `Sudah Periksa` for authorized K2/K3/K6/K7 without entering clinical/program detail. | P0 | User | FR-002, FR-029 | E2E |
| FR-031 | Puskesmas shall inherit all Bidan capabilities and manage/validate detailed K1–K6 program records. | P0 | User | FR-030 | Permission/E2E |
| FR-032 | Server shall enforce K1/K4/K5 at Puskesmas, allow K2/K3/K6/K7 at configured facility types, and represent K8 as PONED/RS delivery milestone. | P0 | User | FR-029 | Rule tests |
| FR-033 | Server shall determine reminder eligibility from milestone date/rule and current visit status, not from client calculation. | P0 | User | FR-029 | Unit/integration |
| FR-034 | For an eligible unconfirmed milestone, system shall create a logical reminder cycle at most once every **3 days** until confirmed/cancelled. | P0 | User | FR-033 | Clock/concurrency |
| FR-035 | Each reminder cycle shall try Android push first and retry retryable failures under configurable policy. | P0 | User | FR-015, FR-034 | Provider/worker test |
| FR-036 | After terminal/no-device push outcome, server shall create an authorized manual WhatsApp action with a server-generated `wa.me` URL and minimal template. | P0 | User | FR-035 | E2E/security |
| FR-037 | System shall track push attempt state separately from `wa.me` action state; it shall never infer WhatsApp sent/delivered/read/failed from link generation/opening. | P0 | Technical constraint | FR-036 | Data/contract test |
| FR-038 | Puskesmas shall be able to see unresolved or manually marked unreachable fallback actions; unresolved fallback may be escalated according to configured SLA. | P0 | User | FR-020, FR-037 | E2E |
| FR-039 | Web and WebView shall consume server-composed view models; domain rule changes shall not require duplicate client rule implementations. | P0 | User | FR-029 | Architecture/E2E |
| FR-040 | Server shall evaluate versioned Sigizi Kesga/fetal-rights program criteria separately from visit occurrence; K6 alone shall not imply final predicate unless the approved rule explicitly says so. | P0 | User + recommendation | FR-031 | Rule/audit test |
| FR-041 | Puskesmas shall have all permissions available to Bidan within Puskesmas scope. | P0 | User | FR-002 | Permission test |
| FR-042 | Bumil shall not self-confirm a completed visit. | P0 | User | FR-019 | Negative E2E |
| FR-043 | K8 shall be represented as a delivery milestone/status with required PONED/RS facility type; detailed delivery EMR is out of scope. | P0 | User | FR-029 | Rule/UI test |

### Deprecated Requirements

| ID | Deprecated Meaning | Replacement |
|---|---|---|
| FR-008 | K1–K6 care plan | FR-029 |
| FR-010 | Admin/Admin2 generic completion | FR-030, FR-031 |
| FR-011 | Old K1–K6 facility matrix | FR-032 |
| FR-012 | Reminder only after overdue | FR-033, FR-034 |
| FR-013 | 7-day cadence | FR-034 |
| FR-014 | Automatic single-channel push/WhatsApp routing | FR-035, FR-036 |
| FR-016 | Official WhatsApp provider send | FR-036, FR-037 |
| FR-025 | Provider delivery attempt model for all channels | FR-037 |
| FR-027 | Bumil self-submitted completed claim | FR-042 |

## 4. Non-Functional Requirements

| ID | Requirement | Target / Status | Verification |
|---|---|---|---|
| NFR-001 | Security baseline | `PROPOSED`: OWASP ASVS L2-aligned controls, no certification claim | Security review |
| NFR-002 | Privacy | Legal review for applicable Indonesian PDP obligations | Checklist |
| NFR-003 | Common API latency | `PROPOSED`: p95 ≤1.5s excluding FCM/network | Load test |
| NFR-004 | Availability | `PROPOSED`: 99.5% monthly API MVP | Monitoring |
| NFR-005 | Scheduler timeliness | `PROPOSED`: 95% due cycles start ≤15 min from due time | Worker metrics |
| NFR-006 | Logical dedupe | No more than one active reminder cycle and one unresolved WA fallback per milestone/window | Concurrency |
| NFR-007 | Backup/recovery | `PROPOSED`: RPO 24h, RTO 8h | Restore drill |
| NFR-008 | Accessibility | `PROPOSED`: WCAG 2.1 AA critical Web/WebView flows | Audit |
| NFR-009 | Time | Store UTC; display/schedule using `Asia/Jakarta` | Timezone test |
| NFR-010 | Observability | API, worker, push attempt, WA fallback backlog, auth failures, DB metrics | Dashboard |
| NFR-011 | Maintainability | Modular boundaries; domain logic server-only | Architecture review |
| NFR-012 | Retention | `TBD`, owner Privacy/Legal | Review |
| NFR-013 | Localization | Bahasa Indonesia default; strings externalized | UI review |
| NFR-014 | Logging safety | No code/token/diagnosis/raw WA message with sensitive detail in logs | Log inspection |
| NFR-015 | Audit integrity | Append-only to application roles | Permission test |
| NFR-016 | Mobile session security | Sensitive session material uses platform secure storage; not plain WebView localStorage | Android review |
| NFR-017 | Thin-client integrity | Client mutation cannot bypass server state/rules | Tamper E2E |
| NFR-018 | Graceful server failure | Web/WebView show safe retry/error state; no stale local health-data source of truth | Failure test |
| NFR-019 | Push retry safety | Retry count/backoff configurable and terminal errors not retried indefinitely | Worker test |

## 5. Business Rules

| ID | Rule |
|---|---|
| BR-ANC-001 | `K` adalah milestone kunjungan, bukan nama trimester. |
| BR-ANC-002 | Exact week windows/config dates berasal dari versioned rule dan membutuhkan clinical approval. |
| BR-ANC-003 | K1/K4/K5 `required_facility=PUSKESMAS`. |
| BR-ANC-004 | K2/K3/K6/K7 menggunakan configured allowed facilities. |
| BR-ANC-005 | K8 `required_facility=PONED_OR_RS` dan bukan full delivery EMR. |
| BR-VISIT-001 | `visit_status` dan `record_validation_status` dipisah. |
| BR-VISIT-002 | Bidan hanya mengonfirmasi K2/K3/K6/K7 sesuai scope. |
| BR-VISIT-003 | Puskesmas dapat melakukan semua konfirmasi Bidan dan mengelola detail K1–K6. |
| BR-VISIT-004 | `visit_status=CONFIRMED` menghentikan reminder milestone meski detail program masih `INCOMPLETE`. |
| BR-NOTIF-001 | Reminder cycle maksimum sekali per 3 hari selama eligible dan belum confirmed. |
| BR-NOTIF-002 | Push selalu dicoba sebelum membuat WA fallback bila device eligible. |
| BR-NOTIF-003 | Retry push hanya untuk retryable failure; default max attempts `PROPOSED=3`, configurable. |
| BR-NOTIF-004 | `wa.me` fallback selalu membutuhkan aksi manusia untuk benar-benar mengirim chat. |
| BR-NOTIF-005 | `LINK_GENERATED`/`LINK_OPENED` tidak sama dengan `SENT`. |
| BR-NOTIF-006 | Jika fallback belum ditindaklanjuti/ditandai `UNREACHABLE`, Puskesmas mendapat unresolved/escalation information. |
| BR-PROGRAM-001 | “Memenuhi Hak Janin” diperlakukan sebagai administrative/program predicate, bukan diagnosis. |
| BR-PROGRAM-002 | Program status selalu menyimpan rule version dan evidence snapshot minimum. |
| BR-ACCESS-001 | Nama adalah identifier, kode unik adalah authenticator; response gagal tidak boleh mempermudah enumeration. |
| BR-PERM-001 | Puskesmas permission set adalah superset Bidan. |

## 6. Data Requirements

UUID sebagai identifier internal. Pada registrasi Bumil, `full_name`, `NIK`, `address`, `phone_number`, dan `pregnancy_start_date` wajib diisi. Nomor HP tetap mutable dan dinormalisasi ke format internasional untuk `wa.me`; NIK bukan identifier internal/primary key dan diperlakukan sebagai data Restricted. Data klinis detail K1–K6 hanya tersedia bagi Puskesmas yang berwenang. URL `wa.me` tidak disimpan permanen kecuali metadata non-sensitive; generate on demand. Audit event tidak menyimpan NIK lengkap, secret, atau raw sensitive payload.

## 7. User Journeys

### JRN-001 — Bumil Access
Puskesmas mendaftarkan Bumil dengan nama, NIK, alamat, nomor telepon, dan tanggal awal kehamilan → server memvalidasi dan menyimpan registrasi/pregnancy → server membuat kode unik sekali tampil → kode di-hash → Bumil memasukkan nama+kode → server menerbitkan restricted session → WebView menampilkan DTO milik Bumil.

### JRN-002 — Reminder Success via Push
Milestone due dan belum confirmed → scheduler membuat cycle → push attempt → success → next cycle earliest +3 hari jika masih unconfirmed → Bidan/Puskesmas confirm → pending future cycle suppressed.

### JRN-003 — Push Failure → Manual `wa.me`
Push retryable → retry under policy → terminal/no-device → `WA_ACTION_REQUIRED` → Bidan/Puskesmas within scope membuka action → server generates minimal `wa.me` → petugas menekan Send di WhatsApp → staff dapat menandai action `RESOLVED` atau `UNREACHABLE`; system never fabricates WA delivery.

### JRN-004 — Bidan Confirms K3
Bidan opens assigned Bumil → K3 → `Konfirmasi Sudah Periksa` → server checks scope/code/state → sets `visit_status=CONFIRMED` + audit → reminder K3 stops → no clinical form shown.

### JRN-005 — Puskesmas Validates K3 Detail
Puskesmas sees K3 confirmed → opens detail K3 → records permitted program components → validates → `record_validation_status=VALIDATED`.

### JRN-006 — Program Assessment
Required milestone records become validated → server evaluates active program rule → stores assessment/result → if incomplete, remains `NOT_YET_MET`; if complete, assigns approved administrative labels.

## 8. Privacy and Compliance Requirements

Data minimization, purpose/consent record, least privilege, access logging, TLS, encrypted storage capability, backup protection, retention matrix before production, correction/deletion/restriction process where legally applicable, and vendor register for FCM/hosting. `wa.me` message content must avoid NIK, diagnosis, lab result, risk category, or other unnecessary health detail.

## 9. Out of Scope

Automatic WhatsApp send via `wa.me`, delivery/read callbacks for `wa.me`, diagnostic decision support, public Bumil search, full delivery EMR, offline-first, WhatsApp bot/gateway.

## 10. Glossary

| Term | Meaning |
|---|---|
| Bumil | Ibu hamil |
| K1–K8 | Milestone/urutan kunjungan/pemeriksaan program |
| Due | Waktu target milestone sudah tercapai |
| Confirmed | Petugas berwenang menyatakan kunjungan terjadi |
| Validated | Puskesmas menyelesaikan/memeriksa detail program K1–K6 |
| `wa.me` | WhatsApp deep link yang memerlukan user menekan Send |
| Fallback action | Tugas manual yang dibuat setelah push terminal failure/no-device |
