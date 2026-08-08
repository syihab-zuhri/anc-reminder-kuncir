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

## 2026-08-08 — Phase 1 authentication and scope

- Staff password memakai salted scrypt `N=2^17, r=8, p=1` sesuai minimum profil scrypt OWASP; password mentah tidak disimpan atau dicatat.
- Access dan refresh token adalah opaque random token. Database hanya menyimpan HMAC-SHA-256 token hash; refresh selalu dirotasi secara atomik dan single-use.
- Setiap protected request memuat ulang session, status staff, status health center, dan assignment aktif dari PostgreSQL agar revocation berlaku segera.
- `health_centers` adalah batas organisasi Puskesmas. Foreign key komposit mencegah village/facility/mother terhubung lintas health center.
- Puskesmas adalah superset capability Bidan. Super Admin hanya memiliki self-read dan ditolak dari health-data routine sampai break-glass diputuskan dan diimplementasikan.
- Provisioning akun Puskesmas pertama adalah command eksplisit dengan confirmation phrase; endpoint staff biasa hanya dapat membuat akun `BIDAN` pada scope Puskesmas aktor.

## Deferred sampai owner approval

- Nilai target minggu/window K1–K8 production.
- Komponen resmi Sigizi Kesga / Memenuhi Hak Janin.
- Retention dan deletion matrix.
- SLA final fallback WhatsApp.

## Android foundation boundary

Phase 0 menyediakan workspace Capacitor, validasi trusted origin, dan halaman fallback lokal. Native Gradle project sengaja dibuat pada `TASK-P4-004`, saat secure-storage bridge, FCM, navigation handling, dan pengujian perangkat diimplementasikan sebagai satu unit.
