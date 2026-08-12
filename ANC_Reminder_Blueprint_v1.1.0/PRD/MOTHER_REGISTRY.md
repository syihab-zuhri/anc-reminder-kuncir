# PRD: Mother Registry

> **Feature ID:** FEAT-REGISTRY  
> **Version:** 1.1.0  
> **Status:** Review  
> **Priority:** P0  
> **Owner:** Product Owner  
> **Dependencies:** FEAT-STAFF  
> **Last Updated:** 2026-08-10

## 1. Overview
Puskesmas mendaftarkan Bumil dengan data wajib nama, NIK, alamat, nomor telepon, dan awal kehamilan; sistem kemudian membuat pregnancy, assignment Bidan bila dipilih, access code, dan consent record.

## 2. Goals
Registrasi sederhana dengan lima data inti wajib, UUID internal, dan pregnancy lifecycle yang auditable.

## 3. Non-Goals
Bukan full EMR; registrasi tidak meminta diagnosis, kategori risiko, hasil laboratorium, atau detail klinis K1–K6.

## 4. Actors & Permissions
Puskesmas create/update; Bidan read basic assigned data; Bumil read own approved subset.

## 5. Preconditions
Puskesmas authenticated dan facility/area tersedia.

## 6. User Stories
`US-REG-001` register Bumil; `US-REG-002` assign Bidan; `US-REG-003` close pregnancy.

## 7. Functional Flow
Puskesmas → input **Nama + NIK + Alamat + Nomor Telepon + Awal Kehamilan** → validasi required fields → normalize phone → simpan mother + pregnancy secara atomik → consent → assign area/Bidan bila relevan → issue access code → server creates K1–K8 instances from active rule version.

## 8. Business Rules
- `BR-REG-001`: UUID is primary identifier; NIK dan phone tidak boleh menjadi primary key.
- `BR-REG-002`: `full_name`, `nik`, `address`, `phone_number`, dan `pregnancy_start_date` wajib pada registrasi.
- `BR-REG-003`: nomor telepon dinormalisasi server-side dan tetap dapat diubah dengan audit.
- `BR-REG-004`: tanggal awal kehamilan menjadi dating input aktif untuk perhitungan administratif server; perubahan harus menyimpan riwayat/revision.
- `BR-REG-005`: one active pregnancy per Bumil `ASSUMED`.
- `BR-REG-006`: close pregnancy suppresses future reminders.

## 9. Acceptance Criteria
- `AC-REG-001`: registrasi ditolak bila salah satu dari nama, NIK, alamat, nomor telepon, atau awal kehamilan kosong/tidak valid.
- `AC-REG-002`: valid registration creates mother+pregnancy+consent atomically or fails safely.
- `AC-REG-003`: phone normalized for communication but never becomes PK.
- `AC-REG-004`: NIK disimpan sebagai data Restricted dan tidak ditampilkan penuh pada log/audit/notification.
- `AC-REG-005`: assignment changes audited.
- `AC-REG-006`: pregnancy close stops future reminder eligibility.

## 10. UI/UX Specifications
Form registrasi menampilkan lima field wajib: **Nama**, **NIK**, **Alamat**, **Nomor Telepon**, dan **Awal Kehamilan**. Field wajib diberi indikator jelas; submit disabled/ditolak sampai valid. Tidak ada risk classification pada form registrasi.

## 11. API References
`API-MOTHER-*`, `API-PREG-*`, `API-ASSIGN-*`.

## 12. Data Model References
`mothers`, `pregnancies`, `pregnancy_milestones`, `pregnancy_lifecycle_events`, `pregnancy_close_cancellation_events`, `reminder_cycles`, `wa_fallback_actions`, `consent_records`, `staff_assignments`. `mothers` menyimpan nama/NIK/alamat/nomor telepon; `pregnancies` menyimpan tanggal awal kehamilan/dating input.

## 13. Notifications & Side Effects
Creates access credential and milestone instances after transaction.

## 14. Error & Recovery Behavior
Duplicate active pregnancy 409; invalid phone 422; authorization 403.

## 15. Security & Privacy
NIK wajib karena kebutuhan operasional yang dikonfirmasi user, tetapi tetap Restricted: jangan masukkan NIK lengkap ke log, audit metadata, push notification, atau URL `wa.me`. Terapkan least privilege dan masking pada tampilan yang tidak memerlukan nilai penuh.

## 16. Analytics & Audit Events
`MOTHER_REGISTERED`, `PREGNANCY_CREATED`, `BIDAN_ASSIGNED`, `PREGNANCY_CLOSED`.

## 17. Testing Scenarios
Required-field validation untuk lima data inti, atomic create, duplicate pregnancy, scope negative, NIK privacy/masking, phone normalization, pregnancy-start persistence/revision, close.

## 18. Dependencies & Rollout
Requires active milestone rule version.

## 19. Open Questions
Retention/legal policy remains external approval.

## 20. Implementation Status - 2026-08-12

`TASK-P2-001` registration and `TASK-P2-002` pregnancy lifecycle are implemented. Dating changes retain
append-only previous/revised values and an operational reason. Create/revise/close are Puskesmas-only,
same-center scoped, idempotent, and audited. Closing changes the pregnancy state and releases the
one-active-pregnancy constraint. `TASK-P2-008` now also locks and cancels every unfinished milestone and
unresolved reminder cycle in that transaction, expires unresolved `wa.me` actions, writes append-only
cancellation snapshots, and prevents any new active reminder cycle after close. Terminal historical facts remain
unchanged.
