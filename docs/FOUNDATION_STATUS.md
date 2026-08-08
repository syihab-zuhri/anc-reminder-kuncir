# Phase-0 Foundation Status

> Historical Phase-0 snapshot. Current auth/security backend progress is recorded in
> [`PHASE_1_BACKEND_STATUS.md`](./PHASE_1_BACKEND_STATUS.md).

Date: 2026-08-08  
Scope: `TASK-P0-002` through `TASK-P0-006`

## Completed and verified locally and in hosted CI

- npm workspaces: Web, API, worker, Android shell, contracts, config, database.
- Clean `npm ci` from the committed lockfile.
- Prettier, ESLint, strict TypeScript, 37 Vitest tests, and production builds.
- PostgreSQL 17 migration `up → down → up`; 22 baseline domain tables.
- NestJS liveness/readiness smoke against the migrated PostgreSQL database: HTTP `200/200`.
- Secret-pattern scan and dependency audit with zero known vulnerabilities at moderate-or-higher severity.
- Production config enforcement for HTTPS, remote PostgreSQL TLS, distinct 32-character secrets, fixed 3-day cadence, and trusted Android origin.
- GitHub Actions [`verify` run 31244315334](https://github.com/syihab-zuhri/anc-reminder-kuncir/actions/runs/31244315334): clean checkout, PostgreSQL migration/rollback/forward, lint, typecheck, 37 tests, production builds, API smoke, secret scan, and dependency audit all passed.
- Public GitHub repository with protected `main`: pull request and strict `verify` check required, admin enforcement enabled, linear history required, and force-push/deletion disabled.

## Intentionally pending

- Native Gradle project, secure-storage bridge, and FCM belong to `TASK-P4-004/P4-005`; Phase 0 only creates the Capacitor workspace, trusted-origin policy, and safe local fallback.
- Staff sessions, organization/village/facility tables, dating revision history, and notification preferences are added in their owning Phase 1/2 migrations after their detailed contracts are reconciled. The baseline does not invent missing fields.
- Clinical week windows, program criteria, retention, and production WhatsApp fallback SLA remain owner approvals.

## Next implementation slice at Phase-0 close

1. `TASK-P1-001` staff authentication/session lifecycle.
2. `TASK-P1-002` organization, village, facility, and assignment data.
3. `TASK-P1-003` centralized authorization and scoped repositories.
4. `TASK-P1-004` append-only audit service.
