# Panduan Deployment aaPanel dengan GitHub dan Cloudflare Tunnel

Panduan ini untuk menjalankan Sistem Pengingat ANC pada server yang dikelola dengan aaPanel.
Kode produksi diambil dari branch `main` repository public GitHub, bukan dari ZIP manual.
Proyek terdiri dari tiga proses Node.js:

- `@anc/web`: aplikasi web Next.js pada port internal `3000`.
- `@anc/api`: REST API NestJS pada port internal `3001`.
- `@anc/worker`: pemroses pengingat/push tanpa port HTTP.

Nginx aaPanel adalah satu-satunya layanan yang menerima trafik publik. PostgreSQL tidak boleh
dibuka ke internet.

> Panduan lama yang memakai ZIP pada bagian 3 dan 13 telah diganti dengan alur GitHub.
> Jangan menaruh NIK, data pasien, password, file Firebase, file `.env`, atau credential Cloudflare
> ke Git.

## Nilai produksi untuk server Anda

| Item                   | Nilai                                                     |
| ---------------------- | --------------------------------------------------------- |
| Repository             | `https://github.com/syihab-zuhri/anc-reminder-kuncir.git` |
| Branch rilis           | `main`                                                    |
| Domain web             | `https://posyandukkn26.my.id`                             |
| Domain API             | `https://posyandukkn26.my.id/api/v1`                      |
| Root site aaPanel      | `/www/wwwroot/posyandukkn26.my.id`                        |
| Folder source aplikasi | `/www/wwwroot/posyandukkn26.my.id/app`                    |
| Tunnel origin          | `http://127.0.0.1:80`                                     |

Karena repository bersifat public, `git clone` tidak memerlukan password GitHub atau personal access
token. Secret produksi tetap diisi melalui environment aaPanel dan tidak ada di repository.

## Kondisi server produksi saat ini (rujukan utama)

Server produksi **tidak** memakai aaPanel/PM2. Bagian lain dokumen ini adalah panduan umum untuk
instalasi baru; untuk server yang berjalan sekarang, pakai bagian ini.

| Komponen        | Kenyataan di server                                                                                                                          |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Host            | Container LXC di VPS, Ubuntu 24.04, Node 24.10, PostgreSQL 16 lokal (database `anc_reminder`)                                                |
| Folder aplikasi | `/www/wwwroot/posyandukkn26.my.id` (bukan repositori git; di-deploy dengan menukar direktori, lihat bawah)                                   |
| Proses          | systemd: `anc-api` (127.0.0.1:3001), `anc-web` (127.0.0.1:3000), `anc-worker`; API dan worker berjalan sebagai `www`                         |
| Konfigurasi     | API dan worker membaca `/www/wwwroot/posyandukkn26.my.id/.env` lewat `--env-file`; `anc-web` memakai `Environment=` di unit-nya              |
| Nginx           | `/etc/nginx/sites-available/posyandukkn26.my.id`: `/api/v1` ke 3001, selain itu ke 3000; header klien diteruskan                             |
| Tunnel          | `cloudflared` (`/etc/cloudflared/config.yml`): `posyandukkn26.my.id` ke `https://localhost:443`; tunnel dipakai bersama situs lain di server |
| Port ke luar    | Hanya 80/443 (nginx) dan SSH; 3000, 3001, dan 5432 terikat ke 127.0.0.1                                                                      |

Nilai penting di `.env` produksi: `NODE_ENV=production`, `APP_BASE_URL=https://posyandukkn26.my.id`,
`API_BASE_URL=https://posyandukkn26.my.id/api/v1`, serta `FCM_PROJECT_ID` dan `FCM_SERVICE_ACCOUNT_JSON`.
Hanya worker yang membuat dan mengirim pengingat; API tidak punya scheduler. `anc-web` memakai
`API_BASE_URL=http://127.0.0.1:3001/api/v1` agar API mempercayai alamat pengunjung yang diteruskan web.

### Prosedur update (tanpa downtime panjang, dengan jalan kembali)

1. **Backup** sebelum menyentuh apa pun, di `/root/backups/`: `pg_dump -Fc anc_reminder` (sebagai
   `postgres`) dan arsip folder aplikasi tanpa `node_modules` dan `.next`.
2. **Staging**: ekstrak commit yang akan dirilis ke `/www/wwwroot/posyandukkn26.my.id.next`
   (`git archive <commit> | ssh <server> "tar -x -C ..."`), salin `.env`, lalu `npm ci` dan build:
   `npm run build:packages`, lalu build `@anc/api`, `@anc/worker`, dan `@anc/web`. Bila
   `package-lock.json` identik dengan yang sedang berjalan (`cmp`), `npm ci` boleh diganti
   `cp -al <folder-live>/node_modules <folder-staging>/node_modules` (hard link, tautan workspace
   berupa symlink relatif sehingga tetap menunjuk ke folder staging). Server berbagi host dengan
   situs lain dan disknya terbatas; jalankan dengan `nice` dan hindari saat host sedang sibuk.
3. **Migration** (hanya menambah, aman untuk kode lama): `node --env-file=.env
packages/database/scripts/migrate-production.mjs` dari folder staging. Latih dulu di salinan hasil
   restore backup bila migration mengubah tabel yang sudah ada. Rilis dengan migration `000021` juga
   memerlukan `scripts/backfill-nik-fingerprints.mjs` (uji coba, lalu `--apply`; lihat bagian 13).
4. **Cutover**: jalankan `scripts/ops/anc-cutover.sh` di server (terlepas dari SSH). Skrip ini
   mencoba API staging di port 3101, menukar direktori (yang lama menjadi `*.prev-<waktu>`), menjalankan
   ulang worker, API, lalu web, memeriksa kesehatan, dan **mengembalikan versi lama otomatis** bila gagal.
5. **Verifikasi**: `/api/v1/health/ready`, halaman `/staff/login`, log `journalctl -u anc-api -u anc-worker`
   (tanpa `fcm_not_configured` pada API).

Rollback manual setelah cutover berhasil: `systemctl stop anc-web anc-api anc-worker`, pindahkan folder
`*.prev-<waktu>` kembali menjadi `/www/wwwroot/posyandukkn26.my.id`, hapus drop-in
`/etc/systemd/system/anc-{api,worker}.service.d/zz-hardening.conf` bila perlu, `systemctl daemon-reload`,
lalu start worker, API, web. Migration yang sudah diterapkan tidak perlu dibatalkan.

Berkas kredensial (`login-info.txt` dan sejenisnya) tidak boleh berada di bawah folder web; simpan di
direktori root-only seperti `/root/anc-moved-secrets-*`.

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

- Web: `https://posyandukkn26.my.id`
- API: `https://posyandukkn26.my.id/api/v1`

## 1. Yang perlu disiapkan sebelum menyentuh aaPanel

### WAJIB! Domain, Cloudflare Tunnel, dan DNS

1. Gunakan domain `posyandukkn26.my.id`.
2. Pada Cloudflare DNS, pastikan CNAME `@` (domain root `posyandukkn26.my.id`) mengarah ke
   `3865ffdc-d9d4-4eb6-87bb-cacd9a537256.cfargotunnel.com` dengan status **Proxied**. Ganti ID tunnel
   di atas dengan ID tunnel Anda jika berbeda.
3. Pada `/etc/cloudflared/config.yml`, tambahkan sebelum catch-all `service: http_status:404`:

   ```yaml
   - hostname: posyandukkn26.my.id
     service: http://127.0.0.1:80
   ```

4. Jalankan `sudo cloudflared tunnel ingress validate`, lalu `sudo systemctl restart cloudflared`.

Cloudflare Tunnel menangani HTTPS publik. Jangan arahkan hostname ini langsung ke port `3000`,
karena Nginx harus membagi trafik web dan API.

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
3. Di **Website**, buat site untuk `posyandukkn26.my.id` dengan Nginx. Jangan menggunakan PHP untuk site
   ini.
4. Jangan membuka `3000`, `3001`, `5432`, atau port worker ke publik. Cloudflared cukup mencapai
   Nginx lokal pada `127.0.0.1:80`.
5. Tidak perlu menerbitkan Let's Encrypt di aaPanel untuk hostname yang hanya diakses melalui
   Cloudflare Tunnel; HTTPS publik disediakan oleh Cloudflare.

aaPanel mendukung Node Project/PM2, domain binding, reverse proxy, dan SSL dari panel. Referensi:
[Node.js Project aaPanel](https://www.aapanel.com/docs/Function/Node.html) dan
[Proxy Project aaPanel](https://www.aapanel.com/docs/Function/proxy.html).

## 3. Clone kode dari GitHub pada deploy pertama

Masuk ke **Terminal** aaPanel atau SSH. Jalankan perintah ini di server:

```bash
SITE_ROOT=/www/wwwroot/posyandukkn26.my.id
APP_DIR="$SITE_ROOT/app"
sudo install -d -o www -g www "$APP_DIR"
sudo git clone --branch main --single-branch \
  https://github.com/syihab-zuhri/anc-reminder-kuncir.git "$APP_DIR"
cd "$APP_DIR"
git branch --show-current       # harus menampilkan: main
git log -1 --oneline            # catat commit rilis yang dipakai
```

Root site aaPanel boleh tetap berisi `404.html`, `502.html`, `.well-known`, `.htaccess`, dan file
bawaan lain. Jangan hapus atau pindahkan file-file tersebut. Repository di-clone ke subfolder `app`
yang baru dan kosong.

Jangan membuat atau mengubah source code langsung di folder server. Semua perubahan dibuat di
komputer pengembang, diuji, dipush, lalu di-merge ke `main`. File `.env`, `google-services.json`,
service account Firebase, dan credential Cloudflare tidak ada di repository.

Jika proses Node aaPanel menggunakan user `www`, berikan hak baca folder proyek kepadanya:

```bash
sudo chown -R www:www /www/wwwroot/posyandukkn26.my.id/app
```

## 4. Install dependency dan build di server

Masuk ke **Terminal** aaPanel atau SSH, lalu:

```bash
cd /www/wwwroot/posyandukkn26.my.id/app
node --version    # harus 24.x
npm --version     # harus 11.x
npm ci
npm run build:packages
npm run build --workspace=@anc/api
npm run build --workspace=@anc/web
npm run build --workspace=@anc/worker
```

Jangan memakai `npm install` acak di produksi; gunakan `npm ci` agar versi tepat mengikuti
`package-lock.json` dari branch `main`.

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
| `FCM_PROJECT_ID`            | API, worker  | ID proyek Firebase.                                                    |
| `FCM_SERVICE_ACCOUNT_JSON`  | API, worker  | JSON service account Firebase utuh, disimpan sebagai secret.           |

## 6. Environment setiap proses

Masukkan environment variable lewat konfigurasi masing-masing Node Project/PM2 di aaPanel. Jangan
menaruh secret dalam `package.json`, konfigurasi Nginx, atau source code.

### 6.1 Web (`anc-web`)

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

### 6.2 API (`anc-api`)

| Variabel                              | Nilai contoh                         |
| ------------------------------------- | ------------------------------------ |
| `NODE_ENV`                            | `production`                         |
| `API_HOST`                            | `127.0.0.1`                          |
| `API_PORT`                            | `3001`                               |
| `APP_BASE_URL`                        | `https://posyandukkn26.my.id`        |
| `API_BASE_URL`                        | `https://posyandukkn26.my.id/api/v1` |
| `PRIMARY_TIMEZONE`                    | `Asia/Jakarta`                       |
| `DATABASE_URL` dan seluruh secret API | sesuai tabel langkah 5               |

FCM adalah satu-satunya kanal notifikasi. API memakainya untuk pengumuman siaran, jadi
`FCM_PROJECT_ID` dan `FCM_SERVICE_ACCOUNT_JSON` harus diisi juga pada proses `anc-api`, bukan hanya
worker. Jika salah satunya kosong, API tetap berjalan tetapi mencatat peringatan `fcm_not_configured`
saat start, dan setiap pengumuman gagal dengan kode `FCM_NOT_CONFIGURED` pada riwayat pengumuman.
Tidak ada kanal cadangan: token perangkat tidak pernah dikirim ke layanan lain.

API tidak lagi punya scheduler: worker pada langkah berikut adalah satu-satunya proses yang
membuat/mengirim siklus pengingat. Variabel `SCHEDULER_ENABLED` dan `SCHEDULER_INTERVAL_SECONDS`
sudah dihapus; bila masih ada di `.env` lama, nilainya diabaikan dan boleh dibuang.

### 6.3 Worker (`anc-worker`)

| Variabel                                                                                  | Nilai contoh           |
| ----------------------------------------------------------------------------------------- | ---------------------- |
| `NODE_ENV`                                                                                | `production`           |
| `WORKER_MODE`                                                                             | `loop`                 |
| `WORKER_POLL_INTERVAL_SECONDS`                                                            | `300`                  |
| `PRIMARY_TIMEZONE`                                                                        | `Asia/Jakarta`         |
| `REMINDER_SEND_HOUR`                                                                      | `8` (opsional)         |
| `DATABASE_URL`, `PUSH_TOKEN_ENCRYPTION_KEY`, `FCM_PROJECT_ID`, `FCM_SERVICE_ACCOUNT_JSON` | sesuai tabel langkah 5 |

`REMINDER_SEND_HOUR` adalah jam lokal (0–23, zona `PRIMARY_TIMEZONE`) mulai kapan worker membuat
pengingat baru; sebelum jam itu tidak ada push maupun antrean WA baru. Bila tidak diisi, nilainya 8
(08:00 WIB). Siklus tetap dihitung per tanggal, dan push yang gagal tetap dicoba ulang sepanjang hari.

## 7. Menjalankan tiga Node Project

Di **Website → Node Project**, buat tiga proses menggunakan Node `24.x`, user `www`, direktori kerja
`/www/wwwroot/posyandukkn26.my.id/app`, dan satu instance/cluster untuk masing-masing proses.

| Nama         | Perintah start kustom                | Port      |
| ------------ | ------------------------------------ | --------- |
| `anc-web`    | `npm run start --workspace=@anc/web` | `3000`    |
| `anc-api`    | `node apps/api/dist/main.js`         | `3001`    |
| `anc-worker` | `node apps/worker/dist/main.js`      | tidak ada |

Pastikan environment dari langkah 6 dimasukkan pada proses yang tepat sebelum menekan **Start**.
Jika versi aaPanel Anda hanya menerima startup file, gunakan mode **PM2 Project** dan masukkan file
`apps/api/dist/main.js` untuk API serta `apps/worker/dist/main.js` untuk worker; untuk web gunakan
custom run command di atas.

Setelah start, cek log tiap proses. API harus mencatat `api_started` (tanpa `fcm_not_configured`);
worker harus mencatat `worker_loop_started`. Tidak boleh ada secret, NIK, kode akses, token, atau nomor telepon mentah di
log.

## 8. Atur reverse proxy Nginx

Biarkan domain utama `posyandukkn26.my.id` diteruskan oleh Node Project `anc-web` ke `127.0.0.1:3000`.
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
cd /www/wwwroot/posyandukkn26.my.id/app
set -a
. /root/anc-migrate.env
set +a
npm run db:migrate:prod
unset DATABASE_DIRECT_URL
```

Jika file migrasi `000016_phase-4-mother-record-archive.cjs` sudah ada di branch `main`, perintah ini juga
menerapkan kemampuan arsip data Ibu Hamil yang baru. Jangan menggunakan rollback otomatis untuk
data produksi; lakukan restore backup bila migrasi bermasalah.

## 10. Provision akun Puskesmas pertama

Setelah API, database, dan migrasi sehat, buat akun pertama dengan identitas yang benar. Jalankan di
terminal dengan environment API yang sama. Jangan gunakan data dummy untuk produksi.

```bash
cd /www/wwwroot/posyandukkn26.my.id/app
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

1. Buka `https://posyandukkn26.my.id` dan `https://posyandukkn26.my.id/staff/login` dari jaringan luar.
2. Login menggunakan akun Puskesmas yang baru dibuat.
3. Pastikan halaman Data Bumil, pendaftaran, dan portal Bumil dapat dibuka.
4. Cek status tiga proses di aaPanel/PM2: web, API, dan worker harus `running`.
5. Cek log API dan worker untuk error koneksi database atau Firebase.
6. Uji dengan data sintetis: daftar Bumil dummy, terbitkan kode akses, lalu hapus data dummy sesuai
   prosedur arsip. Jangan uji dengan data pasien asli pada tahap ini.
7. Cek bahwa `https://posyandukkn26.my.id/api/v1/...` berfungsi melalui domain, sedangkan port `3001`
   tidak dapat diakses langsung dari perangkat luar.
8. Cek pembatasan login per IP: lakukan dua login ibu hamil yang salah dari dua jaringan berbeda
   (misalnya Wi-Fi dan data seluler), lalu jalankan
   `SELECT scope, failure_count FROM mother_access_rate_limits WHERE scope = 'IP';`.
   Harus ada **dua baris** dengan `failure_count = 1`. Satu baris dengan `failure_count = 2` berarti
   API masih melihat satu IP untuk semua pengunjung; periksa `API_BASE_URL` web (langkah 6.1).

## 12. Sinkronkan Android setelah domain aktif

Di komputer pengembang (bukan server aaPanel), jalankan dari PowerShell:

```powershell
Set-Location "D:\posyandu kuncir"
$env:CAPACITOR_SERVER_URL = "https://posyandukkn26.my.id"
npm.cmd run cap:sync --workspace=@anc/android
```

Lalu build ulang Android di Android Studio. Gunakan domain HTTPS yang sama dengan langkah 11.

## 13. Update berikutnya dari GitHub

### WAJIB! Sebelum update

1. Pastikan seluruh perubahan sudah di-merge ke `main` dan pemeriksaan CI GitHub `verify` hijau.
2. Backup database bila rilis membawa migration baru.
3. Gunakan maintenance window jika aplikasi telah menyimpan data nyata.

Di Terminal aaPanel atau SSH, jalankan:

```bash
cd /www/wwwroot/posyandukkn26.my.id/app
git status --short               # harus kosong; source server tidak boleh diedit manual
git fetch origin
git pull --ff-only origin main   # berhenti aman jika riwayat tidak sesuai
git log -1 --oneline             # catat commit rilis terbaru
npm ci
npm run build:packages
npm run build --workspace=@anc/api
npm run build --workspace=@anc/web
npm run build --workspace=@anc/worker
```

Jika ada migration baru, jalankan langkah 9 **setelah backup database**. Setelah itu restart di
aaPanel dengan urutan: **worker**, **API**, lalu **web**. Terakhir, lakukan verifikasi langkah 11.

#### Rilis dengan migration 000021 (satu catatan aktif per NIK)

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

### Rollback kode

Jangan menjalankan `git reset --hard` di server produksi. Catat commit terakhir yang sehat, lalu
checkout commit itu saat maintenance window, install dependency dan build ulang, kemudian restart
tiga proses:

```bash
cd /www/wwwroot/posyandukkn26.my.id/app
git checkout <commit-rilis-sehat>
npm ci
# jalankan kembali tiga perintah build dari blok update di atas
```

Rollback kode tidak membatalkan migration database. Jika migration sudah diterapkan, gunakan
backup/restore yang telah diuji dan jangan rollback schema secara terburu-buru.

## 14. Checklist selesai

- [ ] CNAME `posyandu` mengarah ke Cloudflare Tunnel dan Tunnel sehat.
- [ ] `posyandukkn26.my.id` terbuka melalui HTTPS Cloudflare.
- [ ] Node 24/npm 11 dipakai oleh ketiga proses.
- [ ] Web, API, worker berjalan sebagai proses berbeda.
- [ ] Hanya Nginx menerima trafik publik; port 3000/3001/database privat.
- [ ] Migrasi database selesai dan backup tersimpan.
- [ ] Worker `anc-worker` aktif; hanya proses itu yang membuat dan mengirim pengingat.
- [ ] Semua secret berbeda, tidak ada di Git/log.
- [ ] `google-services.json` Android dan service-account Firebase tidak diunggah ke Git.
- [ ] Android telah disinkronkan menggunakan URL HTTPS produksi.
