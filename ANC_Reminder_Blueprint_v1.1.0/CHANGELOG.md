# Documentation Change Log

> **Project:** Sistem Pengingat ANC Ibu Hamil  
> **Document ID:** DOC-CHANGELOG  
> **Version:** 1.1.0  
> **Status:** Review  
> **Owner:** Product/Project Lead  
> **Last Updated:** 2026-08-12  
> **Depends On:** All project documents

## [2026-08-12] Phase 4 Background Worker, Outbox & WhatsApp Fallback

### Added

- `TASK-P4-001` & `TASK-P4-002` Transactional Outbox & Worker Loop (`processReminderCycles` in `apps/worker`): queries DUE/OVERDUE milestones from ACTIVE pregnancies with GRANTED REMINDER consent, inserts `reminder_cycles` ON CONFLICT DO NOTHING, and routes to `push_attempts` or `wa_fallback_actions` (`READY`).
- `TASK-P4-004` Android WebView Shell (`apps/android`): `AndroidSecureStorage` and `parseTrustedDeepLink` supporting HTTPS-only origin enforcement, token format validation (`anc_mt_...`), and zero local health data persistence.
- `TASK-P4-011` Server-side `wa.me` Link Generator (`apps/api`): `API-WA-001` (`GET /api/v1/wa-fallback/queue`), `API-WA-002` (`POST /api/v1/wa-fallback/:id/generate-link`), and `API-WA-003` (`POST /api/v1/wa-fallback/:id/resolve`) with explicit security disclaimer ("Link wa.me ini adalah aksi manual Bidan dan tidak menjamin status pengiriman/penerimaan pesan di WhatsApp").
- `TASK-P4-013` Web/WebView WhatsApp Fallback Handler (`apps/web`): interactive Antrean Tindak Lanjut WhatsApp in `RoleDashboardShell` allowing Bidan and Puskesmas to open server-generated `wa.me` links safely and mark items as resolved (`RESOLVED`).
- `TASK-P4-014` Atomic Reminder Suppression on Confirmation & Close (`apps/api`): automatically closes active `reminder_cycles` (`status = 'CLOSED'`, `closed_at = CURRENT_TIMESTAMP`) upon milestone visit confirmation (`CONFIRMED`).
- `TASK-P5-004` Organization Summary Reports API (`apps/api`): `API-REPORT-001` (`GET /api/v1/reports/summary`) generating aggregate counts for registered mothers, active pregnancies, confirmed visits (K1–K8), and validated records broken down by village with strict Super Admin default isolation.
- `TASK-P5-005` Versioned Care Plan Configuration UI (`apps/web`): added sub-tab in `OrganizationAdminPanel` displaying active ANC care plan version, approval status, clinical owner grant info, target weeks, allowed facility types, and validation policies per milestone.

## [2026-08-12] Phase 3 Complete Operational & Patient Experience

### Added

- `TASK-P3-005` & `TASK-P3-006` Operational Dashboard Shell (`RoleDashboardShell`): Puskesmas summary/priority action queue, Bidan assigned-area summary/confirmation queue, and scoped operational mother search.
- `TASK-P3-007` Super Admin deny-by-default notice for routine operational health queries in accordance with isolated security policy.
- `TASK-P3-008` Puskesmas K1–K6 Detail Management UI (`PuskesmasClinicalRecordPanel`): versioned clinical record detail editing, validation (`VALIDATED`), and reopening (`INCOMPLETE`) with explicit role boundary checks denying Bidan access.
- `TASK-P3-009` Bidan Konfirmasi Sudah Periksa UI (`BidanVisitConfirmationPanel`): simple one-action visit confirmation for K2/K3/K6/K7 without clinical form fields.
- `TASK-P3-010` & `TASK-P3-011` Bumil Patient Portal (`BumilPatientPortal`): responsive K1–K8 timeline, next milestone recommendation, and server-calculated gestational age/trimester display strictly enforcing the thin-client architecture.

## [2026-08-12] Phase 3 Frontend Administration & Patient Access UIs

### Added

- `TASK-P3-001` Organization & Staff Administration UI (`OrganizationAdminPanel`): facilities CRUD, village management, staff account creation, and village assignments with Puskesmas role boundaries.
- `TASK-P3-002` Mother Registration & Consent UI (`MotherRegistrationPanel`): 5 required fields (`full_name`, `nik`, `address`, `phone_number`, `pregnancy_start_date`), consent selection (`REMINDER`, `DATA_PROCESSING`), client validation, review state, and privacy-preserving success screen displaying redacted NIK (`3515************`).
- `TASK-P3-003` Mother Access Handoff & Reissue UI (`MotherAccessPanel`): initial 16-character access code issuance, handoff warning callout displaying plaintext access code ONCE, credential reissue with reason, and credential revocation workflow.
- `apps/web/app/api/staff-proxy/[...path]` BFF catch-all proxy route handler automatically forwarding authenticated Next.js requests to backend API (`API_BASE_URL`) with CSRF protection and HTTP-only session cookie rotation.
- Updated `StaffWorkspace` layout with modular navigation tabs and updated `staff.css` styles.

## [2026-08-12] Phase 2 Server-Composed Dashboard Endpoints

### Added

- `API-DASH-001` (`GET /dashboard/puskesmas`), `API-DASH-002` (`GET /dashboard/bidan`), and `API-DASH-003` (`GET /mother/me/dashboard`, `GET /dashboard/bumil`) endpoints.
- Puskesmas aggregate dashboard summary and priority action queue.
- Bidan assigned-area summary, assigned villages list, and visit confirmation queue.
- Bumil personal dashboard with mother info, active pregnancy gestational progress, next milestone recommendation, and K1–K8 milestone timeline.
- Role isolation, private cache-control headers, Zod DTO contracts, and integration test suite.

## [2026-08-12] Phase 2 Scoped Operational Queries

### Added

- `API-MOTHER-002` (`GET /mothers`), `API-MOTHER-003` (`GET /mothers/:id`), and `API-MILESTONE-004` (`GET /operational/milestones`) endpoints for operational queries.
- Scoped authorization: Puskesmas accesses aggregate health center scope; Bidan is limited to assigned village/mother scope; Super Admin access is denied by default.
- Cursor-based pagination (`cursor`, `limit`), filtering by search text, village ID, pregnancy status, visit status, milestone code, and due date range.
- Derived gestational age (weeks + days) and trimester labels calculated server-side.
- Zod contract schemas, contract tests, and integration test suite.

## [2026-08-12] Phase 2 Pregnancy Close Cancellation

### Added

- Atomic expansion of `API-PREG-003`: unfinished milestones and unresolved reminder cycles are cancelled in the same transaction as pregnancy close; unresolved `wa.me` actions become `EXPIRED`.
- Append-only per-milestone/per-cycle cancellation snapshots linked to the immutable pregnancy close event.
- A database pregnancy-lock guard that rejects new active reminder-cycle writes after close and serializes scheduler-vs-close races.
- Exact replay, concurrent double-close, terminal-state preservation, audit-count, append-only, fresh migration, rollback/reapply, and PostgreSQL smoke coverage.

### Safety Boundary

- Confirmed, already-cancelled, not-applicable, and terminal reminder outcomes are historical facts and are never overwritten by close.
- The generic audit stores cancellation counts and the operational reason only; it does not copy clinical records or reminder content.

## [2026-08-12] Phase 2 Puskesmas K1–K6 Detail Validation

### Added

- Puskesmas-only `API-VISIT-003..006` for no-store current-detail read, versioned save, final validation, and reasoned reopen.
- Bounded opaque-schema JSON payloads, optimistic revision concurrency, append-only sensitive snapshots, and immutable validation-state snapshots.
- Confirmed-visit prerequisite, synchronized record/milestone validation state, explicit validation attestation, validator/time pairing, idempotent logical dedupe, and redacted identity-only audit.
- Role/scope/K1–K6/state/payload/idempotency/concurrency tests plus PostgreSQL migration rollback/reapply and registry smoke coverage.

### Safety Boundary

- No 10T/component list from the unsigned draft approval form is hardcoded as production truth. `schema_version` remains an opaque governance hook until the Clinical/Program Owner completes approval.
- Bidan, Bumil, Super Admin, K7/K8, and cross-center access cannot read or mutate the sensitive detail payload.

## [2026-08-12] Phase 2 One-Action Visit Confirmation

### Added

- `API-VISIT-001` with a strict date/facility/idempotency request and server-controlled `STAFF_WEB` source; no clinical or program-detail fields are accepted.
- Transactional Bidan assignment and K2/K3/K6/K7 enforcement, Puskesmas K1–K8 inheritance, active pregnancy/same-center facility/rule/date/state validation, and generic out-of-scope denial.
- Append-only confirmation history, one-initial-confirm database guard, independent visit/record-validation response state, redacted audit, exact replay, same-fact logical dedupe, and concurrent-request serialization.
- Contract/API/security/concurrency tests plus PostgreSQL migration rollback/reapply and registry smoke coverage.

### Safety Boundary

- A duplicate carrying different facts is not silently overwritten; it requires the separately governed Puskesmas correction workflow (`API-VISIT-002`/`TASK-P2-013` follow-up policy).
- Confirmed timeline state becomes immediately ineligible for future reminder derivation. Atomic cancellation/suppression against a reminder already in flight remains explicitly tracked by `TASK-P4-014`.

## [2026-08-11] Phase 2 Server-Derived ANC State

### Added

- Server-only gestational completed-week/day calculation using the configured primary timezone and current `PREGNANCY_START_DATE` contract.
- Rule-window or explicit-schedule derivation of target dates, `UPCOMING`/`DUE`/`OVERDUE`, reminder eligibility, configured trimester label, and next unfinished K.
- `API-MILESTONE-002` for a scoped next-milestone DTO; the timeline response now includes the same derivation context for thin Web/WebView clients.
- Timezone-midnight, terminal-state, closed-pregnancy, explicit-schedule, invalid-dating, API scope, and real PostgreSQL smoke coverage.

### Safety Boundary

- No clinical week window or trimester cutoff was added as a constant. Week values and phase labels come from the pregnancy's immutable plan snapshot.
- Future dating bases require separately approved age-offset semantics; this implementation only consumes the lifecycle's current `PREGNANCY_START_DATE` input.
- Explicit schedule mutation/rescheduling remains owned by `TASK-P2-006`; this slice only gives an existing `due_at` precedence during derivation.

## [2026-08-11] Phase 2 ANC K1–K8 Milestone Engine

### Added

- Versioned ANC plan API for draft creation, clinical-owner approval, effective-date activation, active-plan read, and scoped pregnancy milestone read.
- Atomic K1–K8 snapshot creation for every new pregnancy, including rule/plan composite integrity and an immutable pregnancy care-plan binding.
- Server-enforced facility structure: K1/K4/K5 only Puskesmas, K2/K3/K6/K7 configurable within the flexible policy, and K8 only PONED/RS.
- Database lifecycle guards, audited governance mutations, idempotent plan writes, and explicit `clinical_program_owner` capability for approval/activation.
- Contract, API, facility-policy, migration, and real PostgreSQL smoke coverage.

### Safety Boundary

- `SYNTHETIC` plans are development/test-only, must remain `DRAFT`, and are never production-eligible. Production runtime cannot assign them.
- No target-week values were promoted as clinical truth. Activation of a real `CLINICAL` plan remains gated by `OPEN-CLIN-001` and separately controlled approval evidence.
- Due-date, gestational-age, trimester, and due/overdue derivation remain owned by `TASK-P2-006` and `TASK-P2-011`.

## [2026-08-10] Phase 2 Mother Registry Slice

### Added

- `API-MOTHER-001` implementation: strict five-field registration plus explicit UUID idempotency key, Puskesmas-only authorization, and atomic mother/active-pregnancy/reminder-consent creation.
- Indonesian contact normalization, masked response contact, and versioned AES-256-GCM NIK ciphertext using a dedicated runtime key.
- Synthetic PostgreSQL/API smoke for encrypted persistence, active-plan precondition, and idempotency replay; protected CI runs it after synthetic Puskesmas provisioning.
- Puskesmas-only pregnancy create, dating revision, and close endpoints with same-center enforcement, immutable replay snapshots, and append-only history.
- Phase 2 lifecycle migration adds the mother/pregnancy composite scope constraint while deliberately omitting HPL, trimester, and K1-K8 calculations.
- Puskesmas-only Bumil access-code issue/reissue/revoke with active-pregnancy gating, one-active credential, atomic mother-session invalidation, immutable lifecycle snapshots, and audit.
- Response-only `ANC-XXXX-XXXX-XXXX-XXXX` codes carry 80 bits of entropy; database persistence contains a salted scrypt verifier plus keyed-HMAC lookup, and idempotency replay never returns plaintext.
- Public Bumil name/code validation with uniform anti-enumeration `401`, normalized constant-time name comparison, HMAC exact lookup, and mandatory scrypt verification.
- Opaque credential-bound mother sessions defaulting to 30 days without refresh, per-request active-state revalidation, explicit logout, minimum-data `/mother/me`, no-store responses, and strict separation from staff authorization.
- Durable HMAC-only throttling defaults to 10 failures/IP and 5 failures/code per 15-minute window followed by a 15-minute block; configuration, contract, security, migration, and PostgreSQL smoke coverage are included.

### Decisions Recorded

- Owner deferred break-glass for the current roadmap; Super Admin stays deny-by-default for routine health data.
- Privileged-account MFA remains `PROPOSED` pending Security + Product pre-production decision, mechanism, and recovery design.

## [2026-08-08] — Phase 1 Staff Web Access

### Added

- Same-origin Next.js BFF for staff login, identity lookup, automatic refresh rotation, and logout.
- Strict `HttpOnly` staff cookies, exact-origin mutation checks, safe identity-only responses, and validated upstream contracts.
- Responsive staff login, generic failure/session notices, server-unavailable retry, 403 boundary, and role-aware workspace shell.
- Web route/policy tests and a real API/PostgreSQL Web session smoke in protected CI.

### Verified Locally

- Production Web build, 12 Web tests, login/refresh/logout smoke, desktop/mobile visual QA, and WCAG A/AA automated audit pass.

### Decision Status

- Break-glass is `Deferred` by owner decision dated 2026-08-10; privileged-account MFA remains `PROPOSED` for the pre-production Security + Product gate.

## [2026-08-08] — Phase 1 Backend Security Baseline

### Added

- Staff authentication with salted scrypt, persistent lockout, opaque access/refresh tokens, atomic rotation, logout, and scoped revocation.
- Village, facility, Bidan staff, and assignment services bounded by the Puskesmas health-center scope.
- Central capability policy and scoped mother-access repository with Puskesmas-superset and Super Admin deny-by-default behavior.
- Safe append-only audit service, initial Puskesmas provisioner, Phase 1 database verifier, and real PostgreSQL auth/organization smoke.
- Shared idempotency/concurrency coordinator with HMAC-only request fingerprints, resource-reference replay, bounded serializable retry, and real concurrent PostgreSQL smoke.

### Verified Locally

- Full workspace format, lint, strict typecheck, 60 tests, production builds, secret scan, and dependency audit pass.
- 18 API security/integration tests pass, including concurrent refresh replay and cross-role/cross-center negatives.
- PostgreSQL 17 Phase 1 migration passes `up → down → up`; raw-token absence, composite scope FK, and immutable audit controls pass.
- Protected CI now provisions a synthetic Puskesmas and repeats the complete auth, organization, assignment, disable, and logout smoke path.

### Decision Status

- The 2026-08-10 owner decision defers break-glass and keeps privileged-account MFA `PROPOSED` until its pre-production mechanism/recovery decision.

## [2026-08-08] — Implementation Foundation 0.1.0

### Added

- npm-workspaces monorepo untuk Next.js Web, NestJS API, PostgreSQL-backed worker, shared contracts/config/database, dan Capacitor Android shell.
- Strict startup environment validation, canonical API errors, structured logging, request correlation, sensitive-data redaction, liveness, dan readiness.
- PostgreSQL baseline migration dengan forward/down path, append-only audit/history controls, idempotency indexes, dan tanpa production clinical-week seed.
- GitHub Actions CI, dependency/secret scanning, Web foundation, trusted-origin Android fallback, serta API smoke test.

### Verified Locally and in Hosted CI

- Clean `npm ci`, format, ESLint, typecheck, 37 tests, seluruh build, dan secret scan lulus.
- PostgreSQL 17 migration lulus `up → down → up`; API health smoke lulus `200/200`.
- `npm audit --audit-level=moderate` melaporkan 0 vulnerability setelah Capacitor dipin ke versi aman yang kompatibel.
- GitHub Actions run `31244315334` lulus seluruh check dari clean checkout, termasuk migration rollback/forward dan API smoke.
- Public `main` dilindungi oleh pull request wajib, strict `verify`, admin enforcement, linear history, serta larangan force-push/penghapusan branch.

### Remaining Delivery Work

- Implementasi requirement bisnis P0, deployment rehearsal, serta approval clinical/privacy/operations tetap belum selesai.

## [2026-08-08] — 1.1.0 — Registration Data Contract

### Changed
- Registrasi Bumil oleh Puskesmas/Admin sekarang mewajibkan: **Nama, NIK, Alamat, Nomor Telepon, dan Awal Kehamilan**.
- `FR-004` dan `FR-005` diperjelas agar registration contract dan pregnancy dating input konsisten.
- `API-MOTHER-001` sekarang mendokumentasikan atomic create mother + initial pregnancy.
- `mothers` mengubah NIK, alamat, dan nomor telepon menjadi required fields; `pregnancies.dating_date` required sebagai data **Awal Kehamilan**.
- Registration UI, test cases, traceability, dan implementation task diperbarui.

### Security/Privacy Impact
- NIK berubah dari optional menjadi required berdasarkan keputusan produk.
- NIK diklasifikasikan `Restricted`, tidak boleh menjadi primary key, dan tidak boleh masuk log, push notification, `wa.me` URL, analytics, atau generic audit metadata.

### Unchanged
- Role/permission model.
- K1–K8 rules.
- Push → retry → manual `wa.me` fallback.
- Server-driven Web/WebView architecture.

## [2026-08-08] — 1.0.0

### Added
- `PRD/DASHBOARD.md`.
- `PRD/PROGRAM_STATUS.md`.
- `ADR-005` server-driven Web/WebView.
- `ADR-006` push retry + manual `wa.me`.
- `ADR-007` K1–K8/program model.
- FR-029 through FR-043 for current confirmed behavior.

### Changed
- All blueprint documents synchronized to Web + Android WebView.
- Role model changed from Admin/Admin2 to `PUSKESMAS`, `BIDAN`, `BUMIL`, optional `SUPER_ADMIN`.
- Puskesmas permission set is a superset of Bidan.
- Bidan uses confirm-only flow; Puskesmas manages detailed K1–K6.
- ANC model changed from K1–K6 to K1–K8.
- Reminder cadence changed to every 3 days while eligible/unconfirmed.
- Notification flow changed to FCM push → controlled retry → manual `wa.me` fallback.
- WhatsApp provider/webhook/delivery semantics removed.
- `visit_status` separated from `record_validation_status`.
- Program assessment made versioned and independent from K6 completion.
- Server declared authoritative for all business logic; clients thin.

### Deprecated
- FR-008, FR-010, FR-011, FR-012, FR-013, FR-014, FR-016, FR-025, FR-027.
- ADR-002 and ADR-003 are superseded.
- Old task IDs listed in `TASKS.md` deprecation table.

### Removed
- Automatic WhatsApp provider integration from MVP.
- Mother self-completion claim from MVP.
- Client-side authoritative pregnancy/milestone calculation.

### Impact
- API, ERD, permission, architecture, security, UI, testing, runbook, tasks, and traceability now follow the same state/role/notification model.
- `openapi.yaml` remains Deferred until payload review.
- Production still requires clinical/program and privacy/legal approvals.
