# Panduan Deployment Manual ke aaPanel (Tanpa GitHub)

Panduan ini untuk menjalankan Sistem Pengingat ANC pada server yang dikelola dengan aaPanel.
Proyek terdiri dari tiga proses Node.js:

- `@anc/web`: aplikasi web Next.js pada port internal `3000`.
- `@anc/api`: REST API NestJS pada port internal `3001`.
- `@anc/worker`: pemroses pengingat/push tanpa port HTTP.

Nginx aaPanel adalah satu-satunya layanan yang menerima trafik publik. PostgreSQL tidak boleh
dibuka ke internet.

> Gunakan contoh domain `anc.contoh.id` di bawah. Ganti seluruhnya dengan domain Anda sendiri.
> Jangan menaruh NIK, data pasien, password, file Firebase, atau file `.env` ke ZIP upload maupun
> ke Git.

## 0. Gambaran arsitektur

```text
Android / Browser
       |
       | HTTPS 443
       v
Nginx aaPanel ── / ───────────────> Web Next.js        127.0.0.1:3000
       |
       └── /api/v1/ ──────────────> API NestJS          127.0.0.1:3001
                                              |
Worker Node.js ─────────────────────────────────────────┘
                                              |
                                      PostgreSQL / Supabase
```

Satu domain digunakan untuk web dan API. Ini menyederhanakan cookie, CORS, dan Android:

- Web: `https://anc.contoh.id`
- API: `https://anc.contoh.id/api/v1`

## 1. Yang perlu disiapkan sebelum menyentuh aaPanel

### WAJIB! Domain dan DNS

1. Siapkan domain/subdomain, misalnya `anc.contoh.id`.
2. Buat DNS record `A` yang menunjuk ke IP publik server aaPanel.
3. Tunggu hingga resolusi DNS selesai sebelum meminta sertifikat SSL.

Jika server hanya berada di jaringan lokal, domain tersebut harus dapat di-resolve oleh semua
perangkat yang akan mengaksesnya. Let's Encrypt memerlukan domain yang dapat diverifikasi dari
internet; untuk jaringan tertutup gunakan sertifikat dari CA internal yang dipercaya perangkat.

### WAJIB! Database

Pilih salah satu, sebelum deploy:

- **Direkomendasikan:** PostgreSQL terkelola/Supabase. Simpan dua URL: connection pooler untuk
  aplikasi (`DATABASE_URL`) dan koneksi langsung untuk migrasi (`DATABASE_DIRECT_URL`).
- **Server sendiri:** PostgreSQL 17 pada server/LAN privat. Buat database dan user khusus aplikasi;
  batasi aksesnya hanya dari host aplikasi.

Pada produksi untuk database non-local, `DATABASE_URL` wajib menggunakan TLS, misalnya memiliki
`?sslmode=require`.

### WAJIB! Kebutuhan server

- aaPanel dengan **Nginx** dan modul **Node.js Project/PM2**.
- Node.js **24.x** dan npm **11.x** lewat Node Version Manager aaPanel.
- Akses terminal/SSH sebagai administrator server.
- Port publik hanya `80` dan `443`; port panel aaPanel dan SSH dibatasi IP administrator.

## 2. Instalasi awal di aaPanel

1. Di **App Store**, instal Nginx, Node.js Version Manager, dan Node Project/PM2.
2. Melalui Node Version Manager, instal Node `24.x` dan jadikan versi tersebut tersedia untuk
   proyek.
3. Di **Website**, buat site untuk `anc.contoh.id` dengan Nginx. Jangan menggunakan PHP untuk site
   ini.
4. Pada Firewall/security group, buka `80/tcp` dan `443/tcp`; jangan membuka `3000`, `3001`,
   `5432`, atau port worker ke publik.
5. Setelah DNS siap, buka site tersebut di aaPanel, pilih **SSL**, lalu terbitkan sertifikat Let's
   Encrypt dan aktifkan force HTTPS.

aaPanel mendukung Node Project/PM2, domain binding, reverse proxy, dan SSL dari panel. Referensi:
[Node.js Project aaPanel](https://www.aapanel.com/docs/Function/Node.html) dan
[Proxy Project aaPanel](https://www.aapanel.com/docs/Function/proxy.html).

## 3. Menyiapkan paket upload dari komputer pengembang

Jalankan dari PowerShell di komputer Anda, di folder proyek:

```powershell
Set-Location "D:\posyandu kuncir"
npm.cmd run build:packages
npm.cmd run lint
npm.cmd run typecheck
npm.cmd run test:ci
npm.cmd run security:secrets
```

Buat ZIP manual dari source code. Jangan ikutkan item berikut:

- `node_modules/`
- `.git/`
- `.env`, `.env.*`, file service account Firebase
- `apps/android/android/app/google-services.json`
- `coverage/`, `build/`, `.next/`, APK, dan file log

Upload ZIP melalui **Files** aaPanel ke folder baru, misalnya:

```text
/www/wwwroot/anc-reminder
```

Ekstrak di folder tersebut. Pemilik file proses sebaiknya user `www`, tetapi file rahasia pada
langkah berikut harus hanya dapat dibaca administrator/proses yang diperlukan.

## 4. Install dependency dan build di server

Masuk ke **Terminal** aaPanel atau SSH, lalu:

```bash
cd /www/wwwroot/anc-reminder
node --version    # harus 24.x
npm --version     # harus 11.x
npm ci
npm run build:packages
npm run build --workspace=@anc/api
npm run build --workspace=@anc/web
npm run build --workspace=@anc/worker
```

Jangan memakai `npm install` acak di produksi; gunakan `npm ci` agar versi tepat mengikuti
`package-lock.json` yang diupload.

## 5. Membuat rahasia produksi

### WAJIB! Jangan pakai nilai dari `.env.example`

Di terminal server, buat nilai baru. Salin hasilnya langsung ke penyimpanan rahasia aaPanel; jangan
kirim hasilnya lewat chat dan jangan menyimpan history terminal bersama secret.

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"
```

Buat tiga secret hex yang berbeda untuk `SESSION_SECRET`, `MOTHER_SESSION_SECRET`, dan
`IDEMPOTENCY_SECRET`. Buat dua secret Base64 32-byte yang berbeda untuk `NIK_ENCRYPTION_KEY` dan
`PUSH_TOKEN_ENCRYPTION_KEY`.

Nilai rahasia minimal yang harus tersedia adalah:

| Variabel                    | Dipakai oleh | Catatan                                                                |
| --------------------------- | ------------ | ---------------------------------------------------------------------- |
| `DATABASE_URL`              | API, worker  | URL PostgreSQL aplikasi; TLS untuk database non-local.                 |
| `DATABASE_DIRECT_URL`       | migrasi saja | Koneksi langsung database; jangan dipakai runtime bila memakai pooler. |
| `SESSION_SECRET`            | API          | Minimal 32 karakter, berbeda dari secret lain.                         |
| `MOTHER_SESSION_SECRET`     | API          | Minimal 32 karakter, berbeda.                                          |
| `IDEMPOTENCY_SECRET`        | API          | Minimal 32 karakter, berbeda.                                          |
| `NIK_ENCRYPTION_KEY`        | API          | Base64 dari tepat 32 byte.                                             |
| `PUSH_TOKEN_ENCRYPTION_KEY` | API, worker  | Base64 dari tepat 32 byte dan berbeda.                                 |
| `FCM_PROJECT_ID`            | worker       | ID proyek Firebase.                                                    |
| `FCM_SERVICE_ACCOUNT_JSON`  | worker       | JSON service account Firebase utuh, disimpan sebagai secret.           |

## 6. Environment setiap proses

Masukkan environment variable lewat konfigurasi masing-masing Node Project/PM2 di aaPanel. Jangan
menaruh secret dalam `package.json`, konfigurasi Nginx, atau source code.

### 6.1 Web (`anc-web`)

| Variabel       | Nilai contoh                   |
| -------------- | ------------------------------ |
| `NODE_ENV`     | `production`                   |
| `HOSTNAME`     | `127.0.0.1`                    |
| `PORT`         | `3000`                         |
| `API_BASE_URL` | `https://anc.contoh.id/api/v1` |

`API_BASE_URL` adalah variabel server-side untuk route proxy Next.js. Gunakan nama ini, bukan
sekadar `NEXT_PUBLIC_API_URL`.

### 6.2 API (`anc-api`)

| Variabel                              | Nilai contoh                   |
| ------------------------------------- | ------------------------------ |
| `NODE_ENV`                            | `production`                   |
| `API_HOST`                            | `127.0.0.1`                    |
| `API_PORT`                            | `3001`                         |
| `APP_BASE_URL`                        | `https://anc.contoh.id`        |
| `API_BASE_URL`                        | `https://anc.contoh.id/api/v1` |
| `PRIMARY_TIMEZONE`                    | `Asia/Jakarta`                 |
| `SCHEDULER_ENABLED`                   | `false`                        |
| `DATABASE_URL` dan seluruh secret API | sesuai tabel langkah 5         |

`SCHEDULER_ENABLED=false` diperlukan karena worker pada langkah berikut menjadi satu-satunya
proses yang membuat/mengirim siklus pengingat. Jangan menjalankan scheduler API dan worker loop
bersamaan.

### 6.3 Worker (`anc-worker`)

| Variabel                                                                                  | Nilai contoh           |
| ----------------------------------------------------------------------------------------- | ---------------------- |
| `NODE_ENV`                                                                                | `production`           |
| `WORKER_MODE`                                                                             | `loop`                 |
| `WORKER_POLL_INTERVAL_SECONDS`                                                            | `300`                  |
| `PRIMARY_TIMEZONE`                                                                        | `Asia/Jakarta`         |
| `DATABASE_URL`, `PUSH_TOKEN_ENCRYPTION_KEY`, `FCM_PROJECT_ID`, `FCM_SERVICE_ACCOUNT_JSON` | sesuai tabel langkah 5 |

## 7. Menjalankan tiga Node Project

Di **Website → Node Project**, buat tiga proses menggunakan Node `24.x`, user `www`, direktori kerja
`/www/wwwroot/anc-reminder`, dan satu instance/cluster untuk masing-masing proses.

| Nama         | Perintah start kustom                | Port      |
| ------------ | ------------------------------------ | --------- |
| `anc-web`    | `npm run start --workspace=@anc/web` | `3000`    |
| `anc-api`    | `node apps/api/dist/main.js`         | `3001`    |
| `anc-worker` | `node apps/worker/dist/main.js`      | tidak ada |

Pastikan environment dari langkah 6 dimasukkan pada proses yang tepat sebelum menekan **Start**.
Jika versi aaPanel Anda hanya menerima startup file, gunakan mode **PM2 Project** dan masukkan file
`apps/api/dist/main.js` untuk API serta `apps/worker/dist/main.js` untuk worker; untuk web gunakan
custom run command di atas.

Setelah start, cek log tiap proses. API harus mencatat `api_started`; worker harus mencatat
`worker_loop_started`. Tidak boleh ada secret, NIK, kode akses, token, atau nomor telepon mentah di
log.

## 8. Atur reverse proxy Nginx

Biarkan domain utama `anc.contoh.id` diteruskan oleh Node Project `anc-web` ke `127.0.0.1:3000`.
Lalu tambahkan proxy khusus **hanya** untuk `/api/v1/` ke API.

Di konfigurasi Nginx site aaPanel, tambahkan location berikut (sesuaikan melalui menu URL Proxy atau
konfigurasi site):

```nginx
location ^~ /api/v1/ {
    proxy_pass http://127.0.0.1:3001;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 60s;
}
```

Jangan mem-proxy seluruh `/api/` ke API. Path seperti `/api/staff-proxy/...` adalah route milik Next.js
dan harus tetap menuju `anc-web`.

Reload Nginx dari aaPanel setelah menyimpan konfigurasi. Pastikan site HTTPS tetap mengarah ke web
di `127.0.0.1:3000` dan API tidak dapat dibuka langsung melalui `:3001` dari internet.

## 9. Jalankan migrasi database

### WAJIB! Backup database sebelum migrasi

Buat backup/snapshot database melalui provider atau aaPanel. Pastikan backup dapat direstorasi.

Di terminal server, buat file environment sementara yang hanya dapat dibaca administrator, misalnya
`/root/anc-migrate.env`, berisi minimal:

```text
DATABASE_DIRECT_URL=postgresql://...koneksi-langsung-database...
```

Lalu jalankan:

```bash
chmod 600 /root/anc-migrate.env
cd /www/wwwroot/anc-reminder
set -a
. /root/anc-migrate.env
set +a
npm run db:migrate:prod
unset DATABASE_DIRECT_URL
```

Jika file migrasi `000016_phase-4-mother-record-archive.cjs` ikut diupload, perintah ini juga
menerapkan kemampuan arsip data Ibu Hamil yang baru. Jangan menggunakan rollback otomatis untuk
data produksi; lakukan restore backup bila migrasi bermasalah.

## 10. Provision akun Puskesmas pertama

Setelah API, database, dan migrasi sehat, buat akun pertama dengan identitas yang benar. Jalankan di
terminal dengan environment API yang sama. Jangan gunakan data dummy untuk produksi.

```bash
cd /www/wwwroot/anc-reminder
export PROVISION_CONFIRM='CREATE_INITIAL_PUSKESMAS'
export PROVISION_HEALTH_CENTER_CODE='KODE-PUSKESMAS-ASLI'
export PROVISION_HEALTH_CENTER_NAME='Nama Puskesmas Asli'
export PROVISION_LOGIN_IDENTIFIER='operator.puskesmas'
export PROVISION_DISPLAY_NAME='Nama Petugas Berwenang'
read -s PROVISION_PASSWORD
export PROVISION_PASSWORD
npm run staff:provision:puskesmas
unset PROVISION_PASSWORD
```

## 11. Verifikasi setelah deploy

Lakukan berurutan:

1. Buka `https://anc.contoh.id` dan `https://anc.contoh.id/staff/login` dari jaringan luar.
2. Login menggunakan akun Puskesmas yang baru dibuat.
3. Pastikan halaman Data Bumil, pendaftaran, dan portal Bumil dapat dibuka.
4. Cek status tiga proses di aaPanel/PM2: web, API, dan worker harus `running`.
5. Cek log API dan worker untuk error koneksi database atau Firebase.
6. Uji dengan data sintetis: daftar Bumil dummy, terbitkan kode akses, lalu hapus data dummy sesuai
   prosedur arsip. Jangan uji dengan data pasien asli pada tahap ini.
7. Cek bahwa `https://anc.contoh.id/api/v1/...` berfungsi melalui domain, sedangkan port `3001`
   tidak dapat diakses langsung dari perangkat luar.

## 12. Sinkronkan Android setelah domain aktif

Di komputer pengembang (bukan server aaPanel), jalankan dari PowerShell:

```powershell
Set-Location "D:\posyandu kuncir"
$env:CAPACITOR_SERVER_URL = "https://anc.contoh.id"
npm.cmd run cap:sync --workspace=@anc/android
```

Lalu build ulang Android di Android Studio. Gunakan domain HTTPS yang sama dengan langkah 11.

## 13. Update manual berikutnya (tanpa GitHub)

1. Aktifkan maintenance window dan backup database.
2. Upload ZIP rilis baru ke folder baru, misalnya `/www/wwwroot/anc-reminder-releases/2026-08-20`.
3. Jalankan `npm ci`, build, dan pemeriksaan pada folder rilis baru.
4. Jalankan migrasi database bila ada migration baru.
5. Ubah direktori kerja tiga Node Project ke rilis baru, atau ganti symlink `current` secara atomik.
6. Restart worker lebih dulu, API kedua, lalu web terakhir.
7. Jalankan verifikasi langkah 11.
8. Simpan rilis sebelumnya sampai rilis baru stabil.

Untuk rollback kode, arahkan kembali tiga proses ke rilis sebelumnya dan restart. Jangan rollback
schema database secara terburu-buru; gunakan backup/restore yang telah diuji bila diperlukan.

## 14. Checklist selesai

- [ ] DNS domain mengarah ke server.
- [ ] HTTPS aktif dan redirect HTTP ke HTTPS.
- [ ] Node 24/npm 11 dipakai oleh ketiga proses.
- [ ] Web, API, worker berjalan sebagai proses berbeda.
- [ ] Hanya Nginx menerima trafik publik; port 3000/3001/database privat.
- [ ] Migrasi database selesai dan backup tersimpan.
- [ ] `SCHEDULER_ENABLED=false` pada API; hanya worker loop yang aktif.
- [ ] Semua secret berbeda, tidak ada di Git/ZIP/log.
- [ ] `google-services.json` Android dan service-account Firebase tidak diunggah ke Git.
- [ ] Android telah disinkronkan menggunakan URL HTTPS produksi.
