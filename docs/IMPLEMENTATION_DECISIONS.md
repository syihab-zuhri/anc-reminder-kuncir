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
- Idempotency uses a PostgreSQL record scoped by actor + operation + UUID key, but persists only an HMAC request fingerprint and domain resource reference. A dedicated secret, separate from session secrets, keys the fingerprint. Advisory transaction locks serialize same-key races; serializable/deadlock errors retry at most three times. Domain unique constraints remain authoritative.
- Staff Web memakai same-origin BFF. Access/refresh credential hanya ada di cookie `HttpOnly`, `SameSite=Strict`, `Secure` production; browser menerima identity DTO saja. Login/logout memvalidasi `Origin`, refresh diputar oleh route server, dan API tetap menjadi authorization boundary.

## Deferred sampai owner approval

- Nilai target minggu/window K1–K8 production.
- Komponen resmi Sigizi Kesga / Memenuhi Hak Janin.
- Retention dan deletion matrix.
- SLA final fallback WhatsApp.

## 2026-08-10 â€” Privileged-access owner decisions

- Owner menempatkan break-glass (`TASK-P1-005`) sebagai `Deferred` untuk roadmap saat ini. Super Admin tetap tidak memiliki routine health-data access; tidak ada jalur bypass yang diaktifkan.
- MFA Puskesmas/Super Admin (`TASK-P1-008`) tetap `PROPOSED`. Security + Product harus menetapkan mekanisme, recovery, dan go/no-go sebelum pilot atau production privileged access; tidak diimplementasikan dalam Phase 1/2 saat ini.

## Android foundation boundary

Phase 0 menyediakan workspace Capacitor, validasi trusted origin, dan halaman fallback lokal. Native Gradle project sengaja dibuat pada `TASK-P4-004`, saat secure-storage bridge, FCM, navigation handling, dan pengujian perangkat diimplementasikan sebagai satu unit.

## 2026-08-10 - Phase 2 pregnancy lifecycle

- Dating revision menyimpan previous/revised approved input dalam tabel append-only; tidak menghitung HPL, usia kehamilan, trimester, atau window K1-K8 sebelum owning tasks dan approval klinis.
- Pregnancy create/revise/close memakai immutable mutation snapshot sebagai referensi idempotensi agar replay tetap identik walaupun row pregnancy kemudian berubah.
- `PREGNANCY_CLOSED` pada `TASK-P2-002` menutup lifecycle dan melepas partial unique active slot. Pembatalan milestone/reminder atomik tetap di `TASK-P2-008` agar tidak mengklaim side effect yang belum diimplementasikan.

## 2026-08-10 - Phase 2 mother access credential

- Kode handoff memakai prefix `ANC` dan 16 simbol random dari alfabet Base32 tanpa karakter ambigu, dikelompokkan 4-4-4-4. Entropy efektif 80 bit; hanya salted scrypt `N=2^17, r=8, p=1` yang disimpan.
- Plaintext hanya ada pada response eksekusi pertama. Replay idempotensi memakai immutable event snapshot dan mengembalikan `one_time_code: null`; response yang hilang dipulihkan melalui explicit reissue dengan idempotency key baru.
- Reissue/revoke mengunci row mother, menonaktifkan credential lama, dan mencabut seluruh mother session aktif dalam transaksi yang sama. Issue/reissue membutuhkan active pregnancy dan scope Puskesmas yang sama; revoke tetap diizinkan untuk same-center mother agar akses dapat segera dihentikan walaupun pregnancy sudah closed.
- Public name/code verification, anti-enumeration, throttling, serta restricted mother session tetap dipisahkan ke `TASK-P2-004`.
