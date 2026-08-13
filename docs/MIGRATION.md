# Migration Strategy & Baseline Confirmation

**Dokumen Standar Migrasi Data & Konfirmasi Greenfield (TASK-P7-005)**

---

## 1. Konfirmasi Migrasi Legacy Data

Sesuai arsitektur dan spesifikasi proyek **ANC Reminder System Posyandu Kuncir** (`PRD-ANC`, `ADR-001`):

1. **Greenfield Deployment**: Sistem ini disebarkan sebagai sistem baru (greenfield) untuk Puskesmas Kuncir dan Posyandu di bawah wilayah kerjanya.
2. **Tidak Ada Impor Data Legacy**: Tidak ada migrasi otomatis data historis dari sistem legacy terdahulu. Pendaftaran ibu hamil dilakukan secara langsung (greenfield entry) oleh petugas Puskesmas berwenang via API `POST /api/v1/mothers`.
3. **Pendaftaran Perdana & Consent**: Setiap pendaftaran ibu hamil baru secara otomatis menginisialisasi consent pengingat (`REMINDER_MESSAGES`), kehamilan aktif pertama, dan credential akses ibu hamil berbasis _salted scrypt hash_.

---

## 2. Manajemen Skema Database PostgreSQL

Seluruh skema database dikelola melalui skrip migrasi berurutan di `packages/database/migrations/`:

- `000001_baseline.cjs`: Skema tabel awal (fasilitas, desa, petugas, ibu hamil, kehamilan, milestone).
- `000002_phase_1_auth_security.cjs`: Keamanan autentikasi petugas, pembatasan percobaan login, dan lockout.
- `000003_api_idempotency.cjs`: Tabel idempotency key API.
- `000004_phase_2_pregnancy_lifecycle.cjs`: Tabel kehamilan aktif, revisi tanggal penentuan (HPHT/USG), dan riwayat penutupan.
- `000005_phase_2_mother_access_credentials.cjs`: Credential akses pasien Bumil (salted scrypt verifier).
- `000006_phase_2_mother_private_access.cjs`: Sesi akses mandiri pasien Bumil tanpa penyimpanan detail lokal.
- `000007_phase_2_anc_milestone_engine.cjs`: Engine milestone versioned ANC K1–K8 dan persetujuan clinical owner.
- `000008_phase_2_milestone_scheduling.cjs`: Penjadwalan milestone otomatis dan pengubahan jadwal.
- `000009_phase_2_visit_confirmation.cjs`: Konfirmasi kunjungan _one-action_ tanpa penyimpanan detail klinis oleh Bidan.
- `000010_phase_2_clinical_record_validation.cjs`: Rekam medis detail K1–K6 dan validasi Puskesmas.
- `000011_phase_2_pregnancy_close_cancellation.cjs`: Pembatalan otomatis reminder aktif saat penutupan kehamilan.
- `000012_phase_2_program_status.cjs`: Governance rule program, evaluasi versioned, dan riwayat assessment append-only.
- `000013_audit_remediation.cjs`: Uniqueness requirement program per field dan perlindungan append-only untuk riwayat consent.

---

## 3. Verifikasi & Prosedur Rollback Migrasi

1. **Eksekusi Migrasi**: `npm run db:migrate` (dioperasikan di bawah koneksi PostgreSQL terisolasi).
2. **Rollback Rehearsal**: Setiap file migrasi `.cjs` menyediakan fungsi `down(knex)` yang membatalkan perubahan secara simetris tanpa merusak tabel independen.
