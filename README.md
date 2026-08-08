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

Status verifikasi dan batas foundation dicatat di [`docs/FOUNDATION_STATUS.md`](./docs/FOUNDATION_STATUS.md).

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

## Pemeriksaan

```powershell
npm run verify
```

`verify` menjalankan format check, lint, typecheck, test, build, dan secret-pattern scan. Dependency audit dijalankan terpisah lewat `npm run security:dependencies` dan pada CI.

## Invariant implementasi

- Server menentukan authorization, milestone, fasilitas, reminder, dan program assessment.
- Puskesmas adalah superset Bidan; Bumil tidak pernah mengonfirmasi kunjungan sendiri.
- `wa.me` adalah aksi manual dan tidak pernah menghasilkan klaim `SENT`, `DELIVERED`, atau `READ`.
- Target minggu klinis dan retention tidak di-hardcode sebelum approval owner terkait.
