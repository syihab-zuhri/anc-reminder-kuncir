# Task: Persiapan Deploy ANC Reminder ke Hostinger Unlimited + Supabase

## Konteks untuk agent

Repo: `anc-reminder-kuncir` — monorepo npm workspaces berisi:
- `apps/web` — Next.js App Router
- `apps/api` — NestJS modular monolith, REST API `/api/v1`
- `apps/worker` — proses durable terpisah untuk scheduler, outbox, push notifikasi
- `apps/android` — shell Capacitor/WebView
- `packages/*` — contracts, config, database (shared antar apps)

Target hosting: **Hostinger paket "Unlimited"** (shared web hosting, mendukung Node.js app, TAPI tidak menyediakan PostgreSQL native dan tidak menjamin proses background non-HTTP tetap hidup) + **Supabase** sebagai database PostgreSQL eksternal.

Kerjakan task di bawah **berurutan sesuai nomor** — beberapa task saling bergantung.

---

## Task 1 — Gabungkan `apps/worker` ke dalam `apps/api`

**Apa yang diubah:**
Pindahkan logic scheduler, outbox processor, dan push retry dari `apps/worker/src` menjadi bagian dari `apps/api` — jalankan sebagai scheduled task internal (misalnya pakai `@nestjs/schedule`) yang aktif selama proses `api` hidup. `apps/worker` sebagai app terpisah tidak lagi dideploy ke Hostinger (boleh tetap ada di repo sebagai opsi untuk deployment lain di masa depan, misal VPS).

**Kenapa:**
Node.js hosting di paket shared Hostinger hanya menjamin uptime untuk app yang melayani HTTP request (listen di port yang di-assign). Tidak ada dukungan resmi untuk menjalankan daemon background terpisah yang tidak merespons web traffic. Kalau `worker` tetap dideploy terpisah, risikonya proses itu bisa idle/mati tanpa terdeteksi — dan reminder ke ibu hamil jadi telat atau tidak terkirim sama sekali, yang notabene fungsi inti aplikasi ini.

**Referensi:** `ANC_Reminder_Blueprint_v1.1.0/ARCHITECTURE.md` bagian 13 & 15 — pemisahan worker memang disebut sebagai keputusan yang boleh direvisit, bukan keharusan sejak awal, jadi ini bukan penyimpangan dari desain aslinya.

**Kriteria selesai:** `apps/api` saja yang dideploy sudah cukup untuk menjalankan scheduler, outbox, dan push retry tanpa proses `worker` terpisah.

---

## Task 2 — Sesuaikan koneksi database untuk Supabase (pooler vs direct)

**Apa yang diubah:**
Dokumentasikan dan pastikan config mendukung dua jenis connection string Supabase:
- **Pooler (port 6543, transaction mode)** → dipakai `DATABASE_URL` saat aplikasi (`api`) berjalan normal.
- **Direct (port 5432)** → dipakai khusus saat menjalankan migration (`npm run db:migrate`).

Cek juga apakah ada fitur di `packages/database` yang mengandalkan session-level state (misal prepared statement lintas transaksi) yang tidak kompatibel dengan PgBouncer transaction mode — kalau ada, perlu disesuaikan.

**Kenapa:**
Supabase membatasi jumlah koneksi langsung ke database (terutama di plan gratis/kecil). Kalau app produksi connect langsung (bukan lewat pooler), koneksi bisa cepat habis begitu ada beberapa request bersamaan, dan app akan gagal connect ke DB secara acak.

**Kriteria selesai:** App jalan normal pakai pooler URL; migration berhasil pakai direct URL; tidak ada error terkait prepared statement/session state.

---

## Task 3 — Uji kompatibilitas monorepo dengan Node.js app builder Hostinger

**Apa yang diubah:**
Coba deploy `apps/web` dan `apps/api` masing-masing sebagai Node.js app terpisah di Hostinger (via GitHub integration atau ZIP upload). Karena ini monorepo npm workspaces, auto-detect Hostinger kemungkinan mengasumsikan satu `package.json` sederhana di root. Kalau gagal terdeteksi otomatis, siapkan salah satu dari:
- Build command custom per app di panel Hostinger, atau
- Script build yang menghasilkan output standalone per app (root `package.json` proxy, atau `output: 'standalone'` untuk Next.js), atau
- Pisahkan struktur deploy (misal folder terpisah hasil build) khusus untuk kebutuhan Hostinger.

**Kenapa:**
Hostinger tidak mendokumentasikan dukungan resmi untuk monorepo/npm workspaces di Node.js app hosting mereka. Ini satu-satunya bagian yang **tidak bisa dipastikan tanpa dicoba langsung** — kalau gagal total, seluruh rencana deploy ke Hostinger perlu dipertimbangkan ulang (pindah ke VPS Hostinger atau provider lain).

**Kriteria selesai:** Kedua app berhasil di-deploy dan bisa diakses lewat URL masing-masing di Hostinger.

**⚠️ Kerjakan task ini paling awal / paralel** — kalau ternyata gagal, task-task lain di bawah jadi kurang relevan sampai masalah ini terselesaikan.

---

## Task 4 — Hilangkan hardcoded localhost, pastikan base URL dari environment

**Apa yang diubah:**
Audit `apps/api/src` dan `apps/web` untuk memastikan `APP_BASE_URL`, `API_BASE_URL`, dan konfigurasi CORS allow-list di API benar-benar dibaca dari environment variable, bukan default localhost yang menempel di kode.

**Kenapa:**
Setelah live, API harus mengizinkan origin dari domain produksi web (bukan `localhost:3000`), kalau tidak, semua request dari web ke api akan diblokir CORS.

**Kriteria selesai:** `grep -r "localhost" apps/api/src apps/web` tidak menemukan hardcoded value di luar `.env.example`/default dev.

---

## Task 5 — Isi secret & kredensial produksi (bukan nilai contoh)

**Apa yang diubah:**
Generate nilai baru untuk `SESSION_SECRET`, `MOTHER_SESSION_SECRET`, `IDEMPOTENCY_SECRET`, `NIK_ENCRYPTION_KEY`, `PUSH_TOKEN_ENCRYPTION_KEY` (semua harus acak & unik, bukan salinan dari `.env.example`). Buat Firebase project asli untuk mendapatkan `FCM_PROJECT_ID` dan `FCM_SERVICE_ACCOUNT_JSON`.

**Kenapa:**
`packages/config` memvalidasi environment saat startup — kalau nilai-nilai ini kosong/placeholder, app bisa gagal start atau (lebih berbahaya) fitur enkripsi NIK jadi tidak aman. `FCM_*` yang kosong berarti push notifikasi reminder tidak akan pernah benar-benar terkirim walau logic-nya sudah jalan.

**Kriteria selesai:** `apps/api` start tanpa error validasi environment di Hostinger; test push notifikasi end-to-end berhasil sampai ke device.

---

## Task 6 — Buat alur migration untuk produksi

**Apa yang diubah:**
Karena Hostinger shared hosting tidak punya deploy-hook otomatis untuk menjalankan `npm run db:migrate`, tambahkan langkah manual/CI yang jelas: migration dijalankan dari mesin developer atau CI (pakai direct connection Supabase) **sebelum** deploy baru yang mengubah skema di-lakukan.

**Kenapa:**
Tanpa langkah eksplisit ini, ada risiko `api` versi baru boot dengan skema database yang belum sesuai (migration ketinggalan), yang bisa menyebabkan error di runtime.

**Kriteria selesai:** Ada dokumentasi/perintah baku yang bisa diulang setiap kali ada perubahan skema.

---

## Task 7 — Update config Android & build ulang APK

**Apa yang diubah:**
Set `CAPACITOR_SERVER_URL` ke domain HTTPS produksi final, lalu build ulang project Capacitor Android untuk menghasilkan APK baru.

**Kenapa:**
URL server di-bake ke dalam APK saat build, bukan dibaca ulang saat runtime. Deploy web baru tidak otomatis membuat APK yang sudah beredar ikut update ke domain produksi.

**Kriteria selesai:** APK baru berhasil load web app dari domain produksi lewat WebView.

---

## Ke mana masing-masing komponen akan deploy

| Komponen | Tujuan deploy | Catatan |
|---|---|---|
| `apps/web` (Next.js) | Hostinger Unlimited — Node.js app #1 | Domain utama, mis. `ancreminder.id` |
| `apps/api` (+ scheduler worker digabung) | Hostinger Unlimited — Node.js app #2 | Subdomain, mis. `api.ancreminder.id` |
| Database (PostgreSQL) | Supabase project | Pooler untuk runtime, direct untuk migration |
| Push notification (FCM) | Firebase project terpisah (Google Cloud) | Tidak di Hostinger — hanya kredensial yang dipakai `apps/api` |
| `apps/android` (APK) | Build lokal/CI, distribusi manual atau Firebase App Distribution dulu | Play Store baru relevan kalau target sudah publik, bukan cuma staf Puskesmas |

---

## Risiko terbuka yang perlu diawasi, bukan cuma "diperbaiki diam-diam"

1. **Kompatibilitas monorepo (Task 3)** — belum terverifikasi, sifatnya blocking untuk seluruh rencana ini.
2. **Batas resource shared hosting** — kelas paket Unlimited (setara CPU/RAM terbatas) dipakai bersama oleh 2 Node.js app; cukup untuk pilot skala kecil, tapi perlu direvisit (pindah ke VPS) kalau traffic mulai naik atau jumlah Puskesmas bertambah.
