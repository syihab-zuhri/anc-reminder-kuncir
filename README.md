# Sistem Pengingat ANC Ibu Hamil

[![CI](https://github.com/syihab-zuhri/anc-reminder-kuncir/actions/workflows/ci.yml/badge.svg)](https://github.com/syihab-zuhri/anc-reminder-kuncir/actions/workflows/ci.yml)

Implementasi server-driven untuk memantau milestone K1–K8 melalui Web responsif dan Android WebView. Blueprint authoritative berada di [`ANC_Reminder_Blueprint_v1.1.0`](./ANC_Reminder_Blueprint_v1.1.0/agent.md).

## Workspace

- `apps/web` — Next.js App Router untuk Puskesmas, Bidan, dan Bumil.
- `apps/api` — NestJS modular monolith dan REST API `/api/v1`.
- `apps/worker` — worker durable untuk scheduler, outbox, dan push.
- `apps/android` — shell Capacitor/WebView; tidak menyimpan domain state sebagai source of truth.
- `packages/contracts` — schema dan tipe lintas proses.
- `packages/config` — validasi environment saat startup.
- `packages/database` — pool PostgreSQL dan migration framework.

Status verifikasi dicatat di [`docs/FOUNDATION_STATUS.md`](./docs/FOUNDATION_STATUS.md) dan
[`docs/PHASE_1_BACKEND_STATUS.md`](./docs/PHASE_1_BACKEND_STATUS.md).

## Prasyarat

- Node.js 24 dan npm 11.
- PostgreSQL 17, atau Docker/Compose untuk database lokal.

## Mulai lokal

```powershell
Copy-Item .env.example .env
docker compose up -d postgres
npm install
npm run db:migrate
npm run dev:api
npm run dev:web
```

Gunakan data sintetis saja di local/CI. Jangan memasukkan secret, NIK asli, atau data pasien produksi ke repository.

### Provision akun Puskesmas pertama

Jalankan migration lebih dahulu, lalu gunakan perintah eksplisit berikut. Password hanya ditempatkan
sementara di environment proses dan tidak boleh disimpan di repository atau shell history bersama nilai produksi.

```powershell
$env:PROVISION_CONFIRM = "CREATE_INITIAL_PUSKESMAS"
$env:PROVISION_HEALTH_CENTER_CODE = "PKM-KUNCIR"
$env:PROVISION_HEALTH_CENTER_NAME = "Puskesmas Kuncir"
$env:PROVISION_LOGIN_IDENTIFIER = "puskesmas.kuncir"
$env:PROVISION_DISPLAY_NAME = "Operator Puskesmas Kuncir"
$env:PROVISION_PASSWORD = "replace-with-strong-password-2026"
npm run staff:provision:puskesmas
Remove-Item Env:PROVISION_PASSWORD
```

Provisioner menolak pembuatan akun Puskesmas kedua pada health center yang sama dan hanya mencetak ID hasil,
bukan credential.

## Pemeriksaan

```powershell
npm run verify
npm run db:verify:phase1
npm run test:smoke:idempotency
npm run test:smoke:registry
npm run test:smoke:web-session
```

`verify` menjalankan format check, lint, typecheck, test, build, dan secret-pattern scan. Dependency audit dijalankan terpisah lewat `npm run security:dependencies` dan pada CI.
`db:verify:phase1` membutuhkan `DATABASE_URL` yang telah dimigrasikan dan menguji constraint Phase 1 dengan data sintetis yang selalu di-rollback.
`test:smoke:idempotency` membutuhkan build package terbaru dan database termigrasi; row sintetis dibersihkan setelah test.
`test:smoke:registry` membutuhkan build API, akun Puskesmas sintetis, dan database termigrasi; test mencakup registrasi/pregnancy, credential rotation, private mother session, anti-enumeration, logout, dan durable throttling tanpa menyimpan kode/token/IP mentah.
`test:smoke:web-session` membutuhkan build Web/API, akun staff sintetis, dan database termigrasi; test menyalakan Web lokal sementara serta memverifikasi login/refresh/logout tanpa mengekspos token ke JavaScript browser.

## Invariant implementasi

- Server menentukan authorization, milestone, fasilitas, reminder, dan program assessment.
- Puskesmas adalah superset Bidan; Bumil tidak pernah mengonfirmasi kunjungan sendiri.
- `wa.me` adalah aksi manual dan tidak pernah menghasilkan klaim `SENT`, `DELIVERED`, atau `READ`.
- Target minggu klinis dan retention tidak di-hardcode sebelum approval owner terkait.
