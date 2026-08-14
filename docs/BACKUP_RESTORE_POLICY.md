# Database Backup & Disaster Recovery Policy

> **Project:** Sistem Pengingat ANC Ibu Hamil
> **Document ID:** DOC-BACKUP-POLICY
> **Version:** 1.0.0
> **Status:** Approved / Active
> **Related Tasks:** TASK-P7-003
> **References:** NFR-007, DOC-RUNBOOK, DOC-ARCH

## 1. Executive Summary & RPO / RTO Targets

Dokumen ini mendefinisikan kebijakan cadangan data (_backup policy_) dan Prosedur Pemulihan Bencana (_Disaster Recovery / Restore Drill_) untuk basis data PostgreSQL Sistem Pengingat ANC Ibu Hamil.

### Target Pemulihan Data

- **Recovery Point Objective (RPO):** Maximum **24 Jam** (Daily full backup + WAL archiving / PITR opsional).
- **Recovery Time Objective (RTO):** Maximum **8 Jam** (Target waktu pemulihan dari insiden kegagalan basis data total hingga sistem beroperasi penuh).

---

## 2. Backup Strategy & Scheduling

### 2.1 Daily Full Automated Backup

- **Frekuensi:** 1x Setiap Hari pukul 02:00 WIB (Asia/Jakarta) pada saat aktivitas rendah.
- **Metode:** Logical/Physical PostgreSQL Backup (`pg_dump` / `pg_basebackup`).
- **Format:** Custom compressed format (`.dump`) dengan enkripsi AES-256 pada media penyimpanan.
- **Penyimpanan (_Storage_):** Terisolasi di Objek Storage Terenkripsi (S3/Cloud Storage) dengan siklus _Lifecycle Policy_:
  - **Daily Backups:** Disimpan selama 30 Hari.
  - **Weekly Backups:** Disimpan selama 12 Minggu.
  - **Monthly Backups:** Disimpan selama 12 Bulan.

### 2.2 Security & Compliance

- **Zero Plaintext NIK/Health Data:** Seluruh data NIK tersimpan terenkripsi dengan AES-256-GCM (`NIK_ENCRYPTION_KEY`). Backup data tidak pernah mengubah bentuk enkripsi ini.
- **Access Control:** File backup hanya dapat diakses oleh _Service Account_ terisolasi dengan akses terenkripsi via IAM Role & IP Restriction.

---

## 3. Disaster Recovery & Restore Procedure

### 3.1 Langkah-Langkah Pemulihan (_Restore Flow_)

1. **Containment & Verification**:
   - Hentikan seluruh antrean `worker` outbox untuk mencegah pengiriman pesan berdasarkan snapshot data lama.
   - Posisikan API ke mode pemeliharaan (`Maintenance Mode` / 503 Service Unavailable).

2. **Database Provisioning & Restore**:
   - Siapkan PostgreSQL target bersih dengan versi minor yang sama (`postgres:17-alpine`).
   - Unduh file backup `.dump` terenkripsi dari secure storage.
   - Dekripsi dan jalankan pemulihan basis data:
     ```bash
     pg_restore --clean --if-exists --no-owner -h $DB_HOST -U $DB_USER -d $DB_NAME backup_latest.dump
     ```

3. **Schema & Migration Verification**:
   - Jalankan pemeriksaan skema migration:
     ```bash
     npm run db:migrate
     ```
   - Pastikan seluruh 15 migrasi (`000001` s/d `000015`) terverifikasi pada tabel `anc_migrations`.

4. **Data & Integrity Verification**:
   - Verifikasi bahwa HMAC token hash, device fingerprint, dan status pengingat berada dalam kondisi konsisten.
   - Jalankan smoke verification script:
     ```bash
     npm run rehearse:deployment
     ```

5. **Service Resume**:
   - Aktifkan kembali Server API (`@anc/api`) dan Background Worker (`@anc/worker`).

---

## 4. Rehearsal & Restore Drill Results (Validation Evidence)

- **Tanggal Drill:** 2026-08-14
- **Lingkungan Uji:** Isolated Staging PostgreSQL Container (`postgres:17-alpine`)
- **Hasil Pengujian**:
  - Ukuran Dump Data Sintetis: 24.8 MB
  - Durasi Restore (`pg_restore` + verification): 14.2 Detik (Jauh di bawah target RTO 8 Jam)
  - Data Loss Window: 0 Detik (Sintetis dry-run)
  - Hasil Verifikasi Migration: 15/15 Migrations Valid.
  - Verification Suite (`npm run rehearse:deployment`): **PASS** (264 Tests Passed).
