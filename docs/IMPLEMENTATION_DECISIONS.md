# Implementation Decisions

Catatan ini melengkapi—dan tidak menggantikan—ADR pada blueprint.

## 2026-08-08 — Foundation toolchain

- npm workspaces digunakan tanpa orchestrator tambahan agar bootstrap mudah diaudit.
- Node.js 24 dipakai sebagai runtime baseline; framework tetap mengikuti batas dukungan resmi.
- TypeScript strict digunakan di semua workspace.
- PostgreSQL migration memakai forward/down migration yang direview; local/CI menggunakan data sintetis.
- API, worker, Web, dan Android shell tetap menjadi deployment unit terpisah.
- Tidak ada Redis, WhatsApp gateway, atau client-side domain engine pada foundation.
- Capacitor dipin ke `8.4.2` sementara karena `8.5.0` membawa dependency CLI `xcode → uuid@7` dengan advisory moderat; Android runtime tidak memerlukan perubahan 8.5 untuk foundation ini.
- Dependabot memantau mingguan, tetapi major toolchain upgrades harus dilakukan eksplisit sebagai migration task. Versi Capacitor `8.5.0` diabaikan sampai advisory transitif tersebut terselesaikan.
- Web tetap memakai ESLint `9.x`, sedangkan root/server memakai `10.x`. Walaupun `eslint-config-next@16.3.0` mendeklarasikan ESLint `>=9`, plugin React bawaannya gagal pada API ESLint 10 (`contextOrFilename.getFilename`), sehingga konsolidasi ditunda sampai dependency tersebut kompatibel.

## Deferred sampai owner approval

- Nilai target minggu/window K1–K8 production.
- Komponen resmi Sigizi Kesga / Memenuhi Hak Janin.
- Retention dan deletion matrix.
- SLA final fallback WhatsApp.

## Android foundation boundary

Phase 0 menyediakan workspace Capacitor, validasi trusted origin, dan halaman fallback lokal. Native Gradle project sengaja dibuat pada `TASK-P4-004`, saat secure-storage bridge, FCM, navigation handling, dan pengujian perangkat diimplementasikan sebagai satu unit.
