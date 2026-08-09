# Documentation Change Log

> **Project:** Sistem Pengingat ANC Ibu Hamil  
> **Document ID:** DOC-CHANGELOG  
> **Version:** 1.1.0  
> **Status:** Review  
> **Owner:** Product/Project Lead  
> **Last Updated:** 2026-08-10  
> **Depends On:** All project documents

## [2026-08-10] Phase 2 Mother Registry Slice

### Added

- `API-MOTHER-001` implementation: strict five-field registration plus explicit UUID idempotency key, Puskesmas-only authorization, and atomic mother/active-pregnancy/reminder-consent creation.
- Indonesian contact normalization, masked response contact, and versioned AES-256-GCM NIK ciphertext using a dedicated runtime key.
- Synthetic PostgreSQL/API smoke for encrypted persistence, active-plan precondition, and idempotency replay; protected CI runs it after synthetic Puskesmas provisioning.
- Puskesmas-only pregnancy create, dating revision, and close endpoints with same-center enforcement, immutable replay snapshots, and append-only history.
- Phase 2 lifecycle migration adds the mother/pregnancy composite scope constraint while deliberately omitting HPL, trimester, and K1-K8 calculations.

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
