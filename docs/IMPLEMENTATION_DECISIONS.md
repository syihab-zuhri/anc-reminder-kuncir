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

## 2026-08-10 - Phase 2 mother access credential and private session

- Kode handoff memakai prefix `ANC` dan 16 simbol random dari alfabet Base32 tanpa karakter ambigu, dikelompokkan 4-4-4-4. Entropy efektif 80 bit; hanya salted scrypt `N=2^17, r=8, p=1` yang disimpan.
- Plaintext hanya ada pada response eksekusi pertama. Replay idempotensi memakai immutable event snapshot dan mengembalikan `one_time_code: null`; response yang hilang dipulihkan melalui explicit reissue dengan idempotency key baru.
- Reissue/revoke mengunci row mother, menonaktifkan credential lama, dan mencabut seluruh mother session aktif dalam transaksi yang sama. Issue/reissue membutuhkan active pregnancy dan scope Puskesmas yang sama; revoke tetap diizinkan untuk same-center mother agar akses dapat segera dihentikan walaupun pregnancy sudah closed.
- Credential exact lookup memakai domain-separated HMAC dari kode canonical, tetapi salted scrypt tetap menjadi verifier authoritative. Nama dinormalisasi NFKC/whitespace/case lalu dibandingkan sebagai constant-time keyed digest.
- Wrong name/code, malformed atau revoked code, inactive health center, dan tiadanya active pregnancy memakai satu generic `401`; public audit tidak membawa nama, kode, IP, actor ID, atau resource ID.
- Durable throttle menyimpan HMAC bucket saja. Default yang dapat dikonfigurasi: 10 gagal/IP dan 5 gagal/code dalam 15 menit, lalu block 15 menit; success hanya membersihkan bucket code agar histori abuse IP tidak hilang.
- Restricted bearer memiliki 256-bit randomness, default TTL 30 hari, tanpa refresh endpoint. Database menyimpan HMAC token saja dan setiap request memvalidasi ulang session, credential, health center, serta active pregnancy.
- `/mother/me` sengaja hanya mengirim ID/display name/active pregnancy/session context. Logout mencabut session; mother bearer tidak diterima oleh staff guard atau endpoint mutasi pregnancy.

## 2026-08-11 - Phase 2 ANC milestone engine

- Setiap pregnancy baru menyimpan snapshot tepat delapan rule K1–K8 dan `care_plan_version_id`; foreign key komposit mencegah milestone merujuk rule, code, atau plan lain.
- Struktur fasilitas yang sudah diputuskan ditegakkan pada contract dan database: K1/K4/K5 hanya Puskesmas, K2/K3/K6/K7 fleksibel berdasarkan allowlist, dan K8 hanya PONED/RS.
- Draft dapat dibuat oleh Puskesmas, sedangkan approve/activate memerlukan flag eksplisit `clinical_program_owner=false` secara default. Ketiga mutasi idempotent dan diaudit.
- Grant/revoke clinical owner hanya melalui command operasional dengan frasa konfirmasi, target Puskesmas yang eksplisit, alasan wajib, dan audit append-only.
- Plan `SYNTHETIC` hanya untuk development/test, tidak dapat keluar dari DRAFT, tidak production-eligible, dan tidak dapat dipilih pada runtime production.
- Tidak ada seed nilai minggu klinis production. `OPEN-CLIN-001` tetap menjadi gate untuk approval/activation plan `CLINICAL`; due date serta status due/overdue tetap milik `TASK-P2-006`/`TASK-P2-011`.

## 2026-08-11 - Server-derived gestational and milestone state

- Kalkulasi usia memakai selisih tanggal kalender `PREGNANCY_START_DATE` terhadap tanggal server pada `PRIMARY_TIMEZONE`, lalu mengirim completed weeks dan additional days. Jam UTC tidak boleh menggeser hari lokal.
- Week number hanya operator aritmetika terhadap nilai versioned rule: start = `dating_date + week_start×7 hari`, end inklusif = `dating_date + week_end×7 + 6 hari`. Angka week tidak di-hardcode oleh kalkulator.
- `trimester_label` dipilih dari window rule terkonfigurasi; tidak ada cut-off trimester global. Dating basis lain tidak boleh memakai kalkulator sampai offset semantics-nya disetujui dan dikontrakkan.
- Existing explicit `due_at` mengalahkan rule window. Terminal visit state tidak ditimpa; closed pregnancy selalu tidak memiliki next/reminder eligibility dan usia historis berhenti pada tanggal lokal `closed_at`.
- Derived UPCOMING/DUE/OVERDUE dihitung saat read agar tidak menjadi row state yang basi. `TASK-P2-006` tetap pemilik mutasi schedule/reschedule dan worker task tetap pemilik persistence/query scheduler bila diperlukan.

## 2026-10-01 - Dependency audit and the `xlsx` source

- `npm audit --audit-level=high` adalah gate CI. Patch yang dipakai: `next` 16.3.8 (RCE `next/og`), `@nestjs/platform-express` 11.2.7 (membawa `multer` 2.4.0, sehingga override `multer` dihapus), `vitest` 4.1.11, dan `brace-expansion` transitif lewat `npm audit fix`.
- `xlsx` di registry npm berhenti di 0.18.5 dan memiliki advisory prototype pollution serta ReDoS tanpa perbaikan. SheetJS hanya merilis versi terbaru lewat CDN-nya, jadi `apps/web` memakai tarball `https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz` (Apache-2.0, tanpa dependency; lockfile menyimpan hash integritasnya). Web hanya menulis berkas (ekspor Data Ibu Hamil), tidak pernah mem-parse berkas dari pengguna.
- Dependabot tidak memperbarui tarball CDN. Periksa https://cdn.sheetjs.com/ secara berkala dan perbarui URL serta lockfile secara manual; `npm ci` di CI dan server membutuhkan akses ke `cdn.sheetjs.com`.
- Override `sharp` di root tidak lagi berlaku untuk dependency opsional `next`; `sharp` ter-resolve ke 0.35.5 (patch di atas versi yang sebelumnya dikunci), tidak ada advisory.

## 2026-10-02 - Persetujuan registrasi, ekspor data, dan audit login ibu

- Registrasi ibu wajib membawa `consent.data_processing_allowed: true`. Server menyimpan baris `consent_records` dengan purpose `DATA_PROCESSING` (`GRANTED`) di samping baris `REMINDER`, dan mencatat keduanya di audit. Persetujuan pengingat tetap opsional. Kedua kotak di formulir kosong sejak awal, karena data kesehatan butuh persetujuan eksplisit (UU PDP). Ibu yang terdaftar sebelum perubahan ini tidak punya baris `DATA_PROCESSING`; baris itu tidak diisi mundur karena persetujuannya tidak pernah direkam.
- Ekspor Excel memakai `GET /api/v1/mothers/export` dengan filter yang sama seperti daftar (`search`, `village_id`, `pregnancy_status`), cakupan peran yang sama (Bidan hanya wilayah penugasannya), dan batas 5.000 baris (`truncated` bernilai true bila terlampaui). Setiap ekspor dicatat sebagai `MOTHER_LIST_EXPORTED` beserta jumlah baris dan filter, tanpa teks pencarian, sebelum data dikirim.
- Login ibu yang ditolak karena sedang diblokir tidak lagi dicatat ke audit, sama seperti login petugas. Percobaan yang diblokir tidak terbatas jumlahnya, sedangkan kegagalan sebelum blokir (yang terbatas) tetap tercatat sebagai `MOTHER_ACCESS_FAILURE`.

## 2026-10-02 - Identitas Puskesmas, standar K1–K8, dan tampilan

- Nama, alamat, dan kode faskes Puskesmas diambil dari tabel `health_centers` (kolom `address` dan `facility_code` dari migration `000022`) lewat `GET /api/v1/staff/health-center`, dan nama Puskesmas ikut di dashboard ibu. Tidak ada lagi nama Puskesmas yang ditulis permanen di kode; kop cetakan rekam ANC dan layar mengikuti data ini.
- Teks klinis mengikuti rencana K1–K8 yang aktif: 8 kontak sesuai model ANC WHO 2016 (1 di trimester 1, 2 di trimester 2, 5 di trimester 3). Daftar tempat periksa di cetakan dibentuk dari `required_facility_policy` tiap kunjungan, bukan teks tetap. Klaim "sah sebagai bukti" dihapus; cetakan menyatakan dirinya ringkasan pemantauan yang tidak menggantikan Buku KIA.
- Status, tanggal, dan nama desa ditampilkan lewat `apps/web/lib/display-format.ts`: label status dalam bahasa Indonesia, tanggal `16 Apr 2026` pada zona Asia/Jakarta, dan awalan "Desa" yang tidak pernah ganda.
- Tab ruang kerja petugas disimpan di alamat halaman (`/staff?tab=...`), sehingga refresh mempertahankan tab dan tombol Back kembali ke tab sebelumnya.
- Aplikasi Android menampilkan `www/error.html` bawaan APK (Capacitor `server.errorPath`) saat portal tidak bisa dimuat, termasuk galat 502 dari Cloudflare.

## 2026-10-02 - Kebersihan kode dan keputusan yang dibiarkan

- Halaman web memakai CSP per request dari `apps/web/proxy.ts`: `script-src 'self' 'nonce-…' 'strict-dynamic'` tanpa `'unsafe-inline'`. Karena nonce hanya bisa disisipkan saat render, root layout memanggil `connection()` sehingga semua halaman dirender dinamis. `style-src` tetap `'unsafe-inline'` karena komponen memakai atribut `style`, yang tidak bisa dicakup nonce.
- Login ibu tidak lagi menjalankan scrypt. Kode akses dicari lewat HMAC-SHA256 berkunci rahasia server atas kode acak 80-bit, sehingga menemukan kredensial aktif sudah membuktikan kodenya. Hash scrypt tetap dibuat saat kode diterbitkan (oleh petugas, jarang), hanya untuk penyimpanan.
- BFF petugas menggabungkan rotasi refresh token yang memakai token sama, termasuk yang tiba hingga 10 detik setelahnya. Panel yang menembak beberapa request sekaligus setelah access token kedaluwarsa tidak lagi gagal sebagian. Logout tanpa access token yang masih hidup merotasi refresh token dulu agar sesi tetap dicabut di server.
- Semua aksi tindak lanjut WhatsApp ada di `/api/v1/wa-fallback/...`; rute ganda `/reminders/fallback-actions/:id/unreachable` dihapus. Web memanggil `mark-opened` setelah membuka WhatsApp sehingga status "WhatsApp dibuka" tercatat.
- Perangkat hanya dinonaktifkan untuk galat FCM yang menunjuk token (`UNREGISTERED`, `SENDER_ID_MISMATCH`, `NOT_FOUND`, atau `INVALID_ARGUMENT` pada field `message.token`). Galat isi pesan tetap gagal permanen tanpa mematikan perangkat.
- Dibiarkan dengan sengaja:
  - Perangkat ibu tetap menerima pengingat setelah ibu keluar dari portal, karena pengingat adalah fungsi utama dan keluar dari portal tidak boleh diam-diam menghentikannya. Isi notifikasi tidak memuat data klinis.
  - Panel Detail K1–K6 tetap dimatikan di UI (`ENABLE_CLINICAL_RECORDS_PANEL = false`, keputusan pemilik saat rilis dari VPS), sedangkan API-nya dipertahankan agar bisa diaktifkan lagi dan tetap dipakai laporan.
  - Dropdown ibu memuat hingga 2.000 data (dengan pemberitahuan bila terpotong); cukup untuk satu Puskesmas.
- `apps/web/next-env.d.ts` tidak lagi dilacak git, sesuai dokumentasi Next.js. `npm run typecheck` di web menjalankan `next typegen` lebih dulu. PostgreSQL di CI dan `compose.yaml` disamakan dengan produksi (16).
