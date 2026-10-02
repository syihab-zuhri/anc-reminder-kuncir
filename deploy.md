# Panduan Deployment Produksi

Sistem Pengingat ANC berjalan sebagai tiga proses Node.js di satu server:

- `@anc/web`: Next.js (BFF dan halaman) di `127.0.0.1:3000`.
- `@anc/api`: REST API NestJS di `127.0.0.1:3001`, prefix `/api/v1`.
- `@anc/worker`: pembuat dan pengirim pengingat, tanpa port HTTP.

Rilis selalu berasal dari branch `main` repository
`https://github.com/syihab-zuhri/anc-reminder-kuncir` setelah pemeriksaan CI `verify` hijau. Folder
produksi bukan checkout git: setiap rilis diekstrak ke folder staging, dibangun, lalu ditukar dengan
folder yang sedang berjalan. Jangan menaruh NIK, data pasien, password, `.env`, file Firebase, atau
credential Cloudflare di Git.

## Kondisi server produksi

| Komponen        | Kenyataan di server                                                                                                                                                        |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Host            | Container LXC di VPS, Ubuntu 24.04, Node 24.10, PostgreSQL 16 lokal (database `anc_reminder`)                                                                              |
| Folder aplikasi | `/www/wwwroot/posyandukkn26.my.id` (bukan repositori git; di-deploy dengan menukar direktori, lihat bawah)                                                                 |
| Proses          | systemd: `anc-api` (127.0.0.1:3001), `anc-web` (127.0.0.1:3000), `anc-worker`; API dan worker berjalan sebagai `www`                                                       |
| Konfigurasi     | API dan worker membaca `/www/wwwroot/posyandukkn26.my.id/.env` lewat `--env-file`; `anc-web` memakai `Environment=` di unit-nya                                            |
| Nginx           | `/etc/nginx/sites-available/posyandukkn26.my.id`: `/api/v1` ke 3001, selain itu ke 3000; header klien diteruskan                                                           |
| Tunnel          | `cloudflared` (`/etc/cloudflared/config.yml`, tunnel `fcdf99df-fc6c-4a2c-a684-5467ae65ae44`): `posyandukkn26.my.id` ke `https://localhost:443`; dipakai bersama situs lain |
| Port ke luar    | Hanya 80/443 (nginx) dan SSH; 3000, 3001, dan 5432 terikat ke 127.0.0.1                                                                                                    |

Nilai penting di `.env` produksi: `NODE_ENV=production`, `APP_BASE_URL=https://posyandukkn26.my.id`,
`API_BASE_URL=https://posyandukkn26.my.id/api/v1`, serta `FCM_PROJECT_ID` dan `FCM_SERVICE_ACCOUNT_JSON`.
Hanya worker yang membuat dan mengirim pengingat; API tidak punya scheduler. `anc-web` memakai
`API_BASE_URL=http://127.0.0.1:3001/api/v1` agar API mempercayai alamat pengunjung yang diteruskan web.

Unit `anc-api` dan `anc-worker` memakai drop-in `/etc/systemd/system/anc-{api,worker}.service.d/zz-hardening.conf`
(`User=www`, `NoNewPrivileges`, `PrivateTmp`) yang dipasang oleh `scripts/ops/anc-cutover.sh`.

## Prosedur rilis

Semua perintah server dijalankan sebagai root lewat SSH. `L` adalah folder yang sedang berjalan dan
`N` folder staging:

```bash
L=/www/wwwroot/posyandukkn26.my.id
N=/www/wwwroot/posyandukkn26.my.id.next
```

Server berbagi host dengan situs lain dan disknya terbatas: jalankan build dengan `nice` dan hindari
saat host sedang sibuk.

1. **Backup database** sebelum menyentuh apa pun:

   ```bash
   B=/root/backups/anc-pre-deploy-$(date +%Y%m%d-%H%M%S)
   mkdir -p $B && chmod 700 $B
   su postgres -c "pg_dump -Fc -d anc_reminder" > $B/anc_reminder.dump
   chmod 600 $B/anc_reminder.dump && (cd $B && sha256sum anc_reminder.dump > SHA256SUMS)
   echo "$B" > /root/backups/LATEST_PRE_DEPLOY
   ```

2. **Staging.** Dari komputer pengembang, ekstrak commit rilis ke folder staging:

   ```bash
   ssh <server> "mkdir -p $N"   # folder ini harus belum ada
   git archive <commit> | ssh <server> "tar -x -C $N"
   ```

   Di server, salin `.env` dan siapkan dependency. Bila `package-lock.json` identik dengan yang
   berjalan, `node_modules` cukup di-hard-link (tautan workspace berupa symlink relatif sehingga
   tetap menunjuk ke folder staging); bila berbeda, jalankan `npm ci` (butuh akses ke
   `cdn.sheetjs.com`):

   ```bash
   cd $N && cp -a $L/.env .env && chmod 640 .env
   cmp -s package-lock.json $L/package-lock.json && cp -al $L/node_modules node_modules || npm ci
   nice -n 10 npm run build:packages
   nice -n 10 npm run build --workspace=@anc/api
   nice -n 10 npm run build --workspace=@anc/worker
   nice -n 10 npm run build --workspace=@anc/web
   chown -R www:www $N
   ```

3. **Migration**, hanya bila rilis membawa migration baru. Migration hanya menambah objek sehingga
   kode lama tetap berjalan; latih dulu di salinan hasil restore backup bila migration mengubah
   tabel yang sudah ada:

   ```bash
   cd $N && sudo -u www node --env-file=.env packages/database/scripts/migrate-production.mjs
   ```

4. **Cutover** dengan `scripts/ops/anc-cutover.sh`, dijalankan terlepas dari SSH. Skrip mencoba API
   staging di port 3101, menukar folder (yang lama menjadi `*.prev-<waktu>`), menjalankan ulang
   worker, API, lalu web, memeriksa kesehatan, dan **mengembalikan versi lama otomatis** bila gagal:

   ```bash
   scp scripts/ops/anc-cutover.sh <server>:/root/anc-cutover.sh
   ssh <server> 'chmod 700 /root/anc-cutover.sh && setsid nohup /root/anc-cutover.sh >/dev/null 2>&1 &'
   ssh <server> 'tail -f $(ls -t /root/anc-cutover-*.log | head -1)'   # tunggu SUCCESS atau ROLLBACK
   ```

5. **Verifikasi:**
   - `systemctl is-active anc-api anc-web anc-worker` dan jumlah restart 0.
   - `curl http://127.0.0.1:3001/api/v1/health/ready` menjawab `ready`.
   - `/`, `/staff/login`, dan `/mother/login` menjawab 200 lewat domain.
   - Situs lain di tunnel yang sama tetap 200.
   - `journalctl -u anc-api -u anc-worker -u anc-web` tanpa `warn`/`error`, dan API tanpa
     `fcm_not_configured`.

6. **Bersih-bersih:** hapus folder `/root/anc-moved-secrets-<waktu>` yang kosong. Pemilik sistem
   menyimpan hanya folder `*.prev-<waktu>` terbaru sebagai sumber rollback.

### Rollback

Setelah cutover berhasil, rollback manual:

1. `systemctl stop anc-web anc-api anc-worker`.
2. Pindahkan folder yang berjalan ke samping, lalu pindahkan `*.prev-<waktu>` kembali menjadi
   `/www/wwwroot/posyandukkn26.my.id`.
3. `systemctl daemon-reload`, lalu start worker, API, dan web.

Migration yang sudah diterapkan tidak perlu dibatalkan karena kode lama mengabaikan objek baru. Bila
data rusak, restore dari backup langkah 1 (`pg_restore`), jangan rollback schema secara terburu-buru.

### Catatan rilis: migration 000021 (satu catatan aktif per NIK)

Migration `000021` menambah kolom `nik_fingerprint` yang boleh NULL, sehingga kode lama tetap
berjalan. Data yang sudah ada baru ikut dijaga setelah kolom itu terisi:

```bash
cd /www/wwwroot/posyandukkn26.my.id        # atau folder staging yang sudah di-build
node --env-file=.env scripts/backfill-nik-fingerprints.mjs          # uji coba, tidak menulis apa pun
node --env-file=.env scripts/backfill-nik-fingerprints.mjs --apply  # simpan
```

Skrip hanya memproses baris yang `nik_fingerprint`-nya NULL, aman dijalankan ulang, dan memakai
`NIK_ENCRYPTION_KEY` yang sama dengan API. Catatan paling lama mempertahankan slot NIK-nya. Jika
ada ibu yang NIK-nya sama dengan catatan aktif lain, skrip **tidak mengubahnya**, melaporkan id
(bukan NIK) dan keluar dengan kode 3: arsipkan salah satu catatan lewat aplikasi, lalu jalankan
ulang. Id yang `undecryptable` berarti ciphertext NIK tidak bisa dibuka dengan kunci saat ini dan
perlu diperiksa manual. Sebelum backfill selesai, pendaftaran baru tetap dijaga karena API sudah
mengisi `nik_fingerprint` untuk setiap catatan baru.

## Rahasia produksi

### WAJIB! Jangan pakai nilai dari `.env.example`

Di terminal server, buat nilai baru. Masukkan hasilnya langsung ke `.env` produksi; jangan
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
| `FCM_PROJECT_ID`            | API, worker  | ID proyek Firebase.                                                    |
| `FCM_SERVICE_ACCOUNT_JSON`  | API, worker  | JSON service account Firebase utuh, disimpan sebagai secret.           |

## Environment setiap proses

API dan worker membaca `/www/wwwroot/posyandukkn26.my.id/.env` lewat `--env-file`. Web memakai baris
`Environment=` di unit `anc-web`. Jangan menaruh secret di `package.json`, konfigurasi Nginx, atau
source code.

### Web (`anc-web`)

| Variabel       | Nilai contoh                   |
| -------------- | ------------------------------ |
| `NODE_ENV`     | `production`                   |
| `HOSTNAME`     | `127.0.0.1`                    |
| `PORT`         | `3000`                         |
| `API_BASE_URL` | `http://127.0.0.1:3001/api/v1` |

`API_BASE_URL` adalah variabel server-side untuk route proxy Next.js. Gunakan nama ini, bukan
sekadar `NEXT_PUBLIC_API_URL`.

**Harus alamat loopback, bukan domain publik.** Web dan API berjalan di server yang sama, jadi web
memanggil API langsung di `127.0.0.1:3001`. Dengan begitu API melihat web sebagai proxy tepercaya
(`trust proxy: loopback`) dan memakai alamat IP pengunjung yang diteruskan web untuk membatasi
percobaan login yang gagal. Jika diisi domain publik, request memutar lewat Cloudflare dan seluruh
pengunjung terlihat berasal dari satu IP, sehingga batas percobaan login dipakai bersama oleh semua
orang. Web membaca IP pengunjung dari header `CF-Connecting-IP` (diisi Cloudflare); pastikan proxy
Nginx situs tidak membuangnya (perilaku bawaan Nginx meneruskan semua header).

### API (`anc-api`)

| Variabel                              | Nilai contoh                         |
| ------------------------------------- | ------------------------------------ |
| `NODE_ENV`                            | `production`                         |
| `API_HOST`                            | `127.0.0.1`                          |
| `API_PORT`                            | `3001`                               |
| `APP_BASE_URL`                        | `https://posyandukkn26.my.id`        |
| `API_BASE_URL`                        | `https://posyandukkn26.my.id/api/v1` |
| `PRIMARY_TIMEZONE`                    | `Asia/Jakarta`                       |
| `DATABASE_URL` dan seluruh secret API | sesuai tabel rahasia                 |

FCM adalah satu-satunya kanal notifikasi. API memakainya untuk pengumuman siaran, jadi
`FCM_PROJECT_ID` dan `FCM_SERVICE_ACCOUNT_JSON` harus diisi juga pada proses `anc-api`, bukan hanya
worker. Jika salah satunya kosong, API tetap berjalan tetapi mencatat peringatan `fcm_not_configured`
saat start, dan setiap pengumuman gagal dengan kode `FCM_NOT_CONFIGURED` pada riwayat pengumuman.
Tidak ada kanal cadangan: token perangkat tidak pernah dikirim ke layanan lain.

API tidak lagi punya scheduler: worker di bawah adalah satu-satunya proses yang
membuat/mengirim siklus pengingat. Variabel `SCHEDULER_ENABLED` dan `SCHEDULER_INTERVAL_SECONDS`
sudah dihapus; bila masih ada di `.env` lama, nilainya diabaikan dan boleh dibuang.

### Worker (`anc-worker`)

| Variabel                                                                                  | Nilai contoh         |
| ----------------------------------------------------------------------------------------- | -------------------- |
| `NODE_ENV`                                                                                | `production`         |
| `WORKER_MODE`                                                                             | `loop`               |
| `WORKER_POLL_INTERVAL_SECONDS`                                                            | `300`                |
| `PRIMARY_TIMEZONE`                                                                        | `Asia/Jakarta`       |
| `REMINDER_SEND_HOUR`                                                                      | `8` (opsional)       |
| `DATABASE_URL`, `PUSH_TOKEN_ENCRYPTION_KEY`, `FCM_PROJECT_ID`, `FCM_SERVICE_ACCOUNT_JSON` | sesuai tabel rahasia |

`REMINDER_SEND_HOUR` adalah jam lokal (0–23, zona `PRIMARY_TIMEZONE`) mulai kapan worker membuat
pengingat baru; sebelum jam itu tidak ada push maupun antrean WA baru. Bila tidak diisi, nilainya 8
(08:00 WIB). Siklus tetap dihitung per tanggal, dan push yang gagal tetap dicoba ulang sepanjang hari.

## Nginx dan Cloudflare Tunnel

- Cloudflare Tunnel meneruskan `posyandukkn26.my.id` ke Nginx lokal (`https://localhost:443`). Port
  3000, 3001, dan 5432 hanya terikat ke `127.0.0.1`.
- Nginx (`/etc/nginx/sites-available/posyandukkn26.my.id`) meneruskan `/api/v1` ke `127.0.0.1:3001`
  dan selain itu ke `127.0.0.1:3000`. Jangan meneruskan seluruh `/api/` ke API: `/api/staff-proxy/...`
  dan `/api/mother-proxy/...` adalah route milik Next.js.
- Header klien diteruskan apa adanya, termasuk `CF-Connecting-IP` yang dipakai untuk membatasi
  percobaan login per pengunjung.
- Tunnel dan Nginx dipakai bersama situs lain. Me-restart `cloudflared` atau mengubah konfigurasi
  global berdampak ke semua situs, jadi koordinasikan dengan pemilik server.

## Akun Puskesmas pertama (server baru)

Setelah API, database, dan migrasi sehat, buat akun pertama dengan identitas yang benar. Jalankan di
terminal dengan environment API yang sama. Jangan gunakan data dummy untuk produksi.

```bash
cd /www/wwwroot/posyandukkn26.my.id
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

## Data Puskesmas

Nama, alamat, dan kode faskes yang tampil di aplikasi dan kop cetakan diambil dari tabel
`health_centers` (kolom `name`, `address`, `facility_code`). Belum ada layar untuk mengubahnya; ubah
lewat SQL dalam transaksi bersama catatan `audit_events`, lalu cek `GET /api/v1/staff/health-center`.

## Pemeriksaan pembatasan login per IP

Lakukan dua login ibu hamil yang salah dari dua jaringan berbeda (misalnya Wi-Fi dan data seluler),
lalu jalankan
`SELECT scope, failure_count FROM mother_access_rate_limits WHERE scope = 'IP';`.
Harus ada **dua baris** dengan `failure_count = 1`. Satu baris dengan `failure_count = 2` berarti
API masih melihat satu IP untuk semua pengunjung; periksa `API_BASE_URL` web (bagian Web di atas).

## Android

Di komputer pengembang, sinkronkan shell Capacitor dengan domain HTTPS produksi, lalu bangun ulang
APK (lihat `apps/android/README.md`):

```powershell
$env:CAPACITOR_SERVER_URL = "https://posyandukkn26.my.id"
npm.cmd run cap:sync --workspace=@anc/android
```

## Checklist server baru

- [ ] Node 24, PostgreSQL 16, Nginx, dan `cloudflared` terpasang; tunnel sehat.
- [ ] Database `anc_reminder` dan user aplikasi dibuat; migration selesai dan backup tersimpan.
- [ ] `.env` produksi berisi semua rahasia yang berbeda-beda; tidak ada di Git maupun log.
- [ ] Unit systemd `anc-api`, `anc-web`, `anc-worker` aktif, API dan worker sebagai `www`.
- [ ] Hanya Nginx menerima trafik; port 3000, 3001, dan 5432 privat.
- [ ] Hanya `anc-worker` yang membuat dan mengirim pengingat.
- [ ] Akun Puskesmas pertama dan data `health_centers` terisi.
- [ ] APK Android disinkronkan dengan URL HTTPS produksi.
