# Product & Project Planning

> **Project:** Sistem Pengingat ANC Ibu Hamil  
> **Document ID:** DOC-PLANNING  
> **Version:** 1.0.0  
> **Status:** Review  
> **Owner:** Product Owner  
> **Last Updated:** 2026-08-08  
> **Depends On:** DOC-MANIFEST

## 1. Executive Summary

Sistem Pengingat ANC Ibu Hamil membantu Puskesmas dan Bidan memantau milestone K1–K8 serta mengingatkan Bumil agar melakukan pemeriksaan sesuai jadwal. Produk mempunyai dua surface: **responsive Web** dan **Android WebView**. Client bersifat thin client; server merupakan source of truth untuk authorization, perhitungan usia kehamilan/trimester, milestone, jadwal reminder, status kunjungan, rule fasilitas, dan program assessment.

Bumil masuk menggunakan **nama + kode unik**. Reminder untuk milestone yang telah eligible tetapi belum dikonfirmasi berjalan **setiap 3 hari**. Android push melalui FCM menjadi jalur pertama. Kegagalan push yang tetap gagal setelah retry terkontrol membuat **aksi fallback WhatsApp** untuk petugas. Server membuat link `wa.me` dengan pesan minimal; petugas membuka WhatsApp dan menekan Kirim secara manual. Karena `wa.me` tidak memberi delivery/read callback, sistem tidak menyebut pesan `SENT/DELIVERED`.

Bidan hanya mengonfirmasi sederhana bahwa Bumil **sudah periksa** untuk milestone yang menjadi kewenangannya. Puskesmas memiliki seluruh kewenangan Bidan serta mengelola detail pencatatan K1–K6 dan evaluasi program.

## 2. Problem Statement & Opportunity

Masalah utama:
- Bumil dapat melewatkan pemeriksaan karena tidak mendapat pengingat tepat waktu.
- Petugas perlu mengetahui milestone mana yang sudah/ belum dilakukan.
- Puskesmas perlu memisahkan konfirmasi kunjungan sederhana dari pencatatan detail program.
- Push Android dapat gagal karena token/perangkat/izin; perlu fallback operasional yang murah.
- Data kehamilan sensitif sehingga akses harus dibatasi menurut role dan wilayah.

Value proposition: **satu server yang menentukan reminder dan progres ANC secara konsisten, dengan client Web/WebView sederhana serta fallback WhatsApp manual tanpa gateway.**

## 3. Objectives and Success Metrics

Semua target berikut `PROPOSED` sampai pilot menghasilkan baseline.

| ID | Objective | Proposed Metric | Verification |
|---|---|---|---|
| OBJ-001 | Mengurangi kunjungan tanpa tindak lanjut | ≥90% milestone due memiliki tindakan/konfirmasi dalam 7 hari | Pilot report |
| OBJ-002 | Menghentikan reminder setelah kunjungan | <1% reminder cycle dibuat setelah `visit_status=CONFIRMED` | Audit/query test |
| OBJ-003 | Menjaga isolasi data | 100% negative authorization tests P0 lulus | Security E2E |
| OBJ-004 | Mengetahui push gagal | 100% terminal push failure membuat fallback action yang dapat dilihat Puskesmas | Integration test |
| OBJ-005 | Tidak membuat klaim palsu WhatsApp | 0 event `SENT/DELIVERED` yang berasal hanya dari `wa.me` | Data/log audit |
| OBJ-006 | Menyederhanakan kerja Bidan | Konfirmasi kunjungan dapat diselesaikan ≤2 action setelah membuka Bumil | UX test |
| OBJ-007 | Menjaga status program dapat diaudit | 100% status program menyimpan rule version dan evaluated_at | Integration test |

## 4. Users and Stakeholders

### Primary Users

- **Bumil:** melihat ringkasan sendiri, timeline K1–K8, next visit, lokasi, reminder, dan kontak.
- **Bidan:** melihat Bumil yang ditugaskan dan melakukan konfirmasi sederhana untuk K2/K3/K6/K7.
- **Puskesmas:** memiliki seluruh kemampuan Bidan, registrasi/assignment, pengelolaan detail K1–K6, validasi, fallback reminder, program status, dan monitoring.
- **Super Admin:** operasi teknis tanpa akses rutin ke data kesehatan; break-glass hanya jika kemudian disetujui.

### Governance Stakeholders

Clinical/Program Owner, penanggung jawab Puskesmas, Privacy/Legal reviewer, Security reviewer, Engineering, QA, dan DevOps.

## 5. Scope

### P0 — Must Have

- Staff authentication/session.
- Nama + kode unik untuk akses Bumil.
- Registry Bumil, pregnancy, facility, village/area, dan assignment Bidan.
- Server-driven usia kehamilan/trimester/next milestone.
- Versioned K1–K8 milestone plan.
- K1/K4/K5 required Puskesmas.
- K2/K3/K6/K7 facility fleksibel sesuai rule version.
- K8 sebagai milestone persalinan PONED/RS; status/timeline, bukan EMR persalinan.
- Bidan one-action **Konfirmasi Sudah Periksa** K2/K3/K6/K7.
- Puskesmas dapat melakukan seluruh aksi Bidan dan mengelola detail K1–K6.
- Pemisahan `visit_status` dari `record_validation_status`.
- Reminder setiap 3 hari selama milestone due/overdue belum `CONFIRMED`.
- FCM push + controlled retry.
- Terminal push failure → manual `wa.me` action.
- Puskesmas dapat melihat unresolved fallback; staff dapat menandai hasil manual `RESOLVED` atau `UNREACHABLE`.
- No false WhatsApp delivery/read status.
- Program assessment versioned untuk Pencatatan Sigizi Kesga / Memenuhi Hak Janin.
- Audit, privacy baseline, backup, monitoring, graceful server-down UI.

### P1 — Should Have

- Laporan agregat dan export terkontrol.
- Facility override dengan approval.
- Service-hour/calendar.
- Advanced escalation SLA untuk fallback tidak ditindaklanjuti.
- Config UI untuk care-plan/program rules setelah clinical approval.
- Device recovery UX.

### P2 — Later

- iOS.
- Offline-first.
- WhatsApp Business API untuk benar-benar otomatis.
- Two-way chat.
- External health-system integration.
- Multi-organization SaaS.
- Predictive analytics.

### Out of Scope

Diagnosis, medication recommendation, risk classification otomatis, full EMR, WhatsApp bot/gateway/unofficial automation, menganggap `wa.me` sebagai bukti terkirim, public mother search, dan microservices untuk MVP.

## 6. Information Architecture

### Web — Puskesmas

Login → Dashboard → Bumil → Pregnancy → Timeline K1–K8 → Detail K1–K6 → Validasi → Reminder Fallback → Program Status → Staff/Assignment → Facilities → Audit → Reports/Settings.

### Web — Bidan

Login → Dashboard Saya → Bumil Saya → Timeline → **Konfirmasi Sudah Periksa** → Fallback WA untuk Bumil dalam scope → Kontak.

### Android WebView — Bumil

Akses Nama + Kode → Beranda → Ringkasan kehamilan → Next visit → Timeline K1–K8 → Detail lokasi → Notifikasi → Hubungi Bidan/Puskesmas.

## 7. Release Strategy

| Release | Scope | Exit Condition |
|---|---|---|
| R0 Foundations | Repo, CI, auth, DB, permission skeleton | Baseline tests lulus |
| R1 Core ANC | Registry, K1–K8 engine, confirmation, detail K1–K6 | Core domain E2E lulus |
| R2 Reminder Pilot | Scheduler 3 hari, FCM retry, `wa.me` fallback dashboard | Retry/dedupe/no-false-WA-status tests lulus |
| R3 Field Pilot | Web + WebView untuk area terbatas | Clinical/privacy review + runbook rehearsal |
| R4 MVP | Semua P0 | Gate D conditions accepted |

## 8. Timeline Range

`PROPOSED` planning aid untuk tim kecil 2–4 engineer dengan QA/clinical part-time:
- Foundation + auth/data: 2–3 minggu.
- Core ANC + role UI: 3–5 minggu.
- Reminder + WebView: 2–4 minggu.
- Hardening/pilot: 2–4 minggu.
- Total indicative: **9–16 minggu**, bukan deadline commitment.

## 9. Technology Summary

| Area | Direction | Status | Reasoning |
|---|---|---|---|
| Web | Next.js + TypeScript | `PROPOSED` | Responsive dan satu UI codebase |
| Android | Capacitor/WebView shell | `PROPOSED` | Thin native shell, FCM, secure storage |
| Backend | NestJS modular monolith | `PROPOSED` | Server-owned business rules, testable modules |
| Database | PostgreSQL | `PROPOSED` | Transactional consistency + relational constraints |
| Jobs | PostgreSQL-backed queue/outbox worker | `PROPOSED` | Lebih lean dari Redis untuk MVP |
| Push | FCM | `CONFIRMED DIRECTION` | Android push |
| WhatsApp | `wa.me` manual | `CONFIRMED` | Tidak memakai gateway/API pada MVP |
| Hosting | Container runtime + managed/maintained PostgreSQL | `PROPOSED` | Operasional sederhana |

> 💡 Reasoning: modular monolith dan server-driven clients mengurangi duplikasi rule antara Web dan WebView.
> 🔁 Revisit Trigger: sustained worker backlog, >1 independent backend team, atau SLO tidak tercapai setelah vertical scaling/worker separation.

## 10. Constraints

- Data pribadi dan pregnancy-related data bersifat sensitif.
- `wa.me` membutuhkan aksi manual dan tidak memberi delivery/read callback.
- Server merupakan critical dependency; offline-first tidak ada di MVP.
- Bahasa Indonesia; timezone operasional `Asia/Jakarta`.
- Nomor telepon bukan primary identifier; gunakan UUID.
- Exact clinical week windows dan komponen program wajib disetujui Clinical/Program Owner.
- Scale/budget final belum dikonfirmasi.

## 11. Assumption Register

| ID | Assumption | Rationale | Impact if Wrong | Confidence | Validation Owner |
|---|---|---|---|---|---|
| ASM-001 | Satu Puskesmas/organization dengan beberapa area untuk MVP | Current scope | Medium | Medium | Product |
| ASM-002 | Satu pregnancy aktif per Bumil | Lifecycle simplification | Medium | High | Clinical |
| ASM-003 | Push max attempt default 3, configurable | User meminta beberapa retry | Low | Medium | Engineering |
| ASM-004 | Satu unresolved `wa.me` fallback per milestone untuk mencegah duplicate | Operational simplicity | Medium | High | Product |
| ASM-005 | K8 tidak memakai reminder 3-hari secara default | K8 adalah persalinan/status | Medium | Medium | Clinical |
| ASM-006 | Program assessment default mengecek required K1/K4/K5/K6 yang tervalidasi | Materi domain yang diberikan | High | Medium | Clinical |
| ASM-007 | Retention period belum diputuskan | No policy supplied | High | High | Privacy/Legal |

## 12. Risk Register

| ID | Risk | Probability | Impact | Mitigation | Owner |
|---|---|---|---|---|---|
| RSK-001 | Server down membuat Web/WebView tidak dapat memproses rule | Medium | High | HA baseline, health checks, retry/error state, backup | DevOps |
| RSK-002 | Push token invalid/tidak diizinkan | High | Medium | Retry classification + fallback action | Backend/Mobile |
| RSK-003 | Petugas mengira membuka `wa.me` berarti pesan terkirim | High | High | Status semantics + UI copy + training | Product/QA |
| RSK-004 | Fallback `wa.me` tidak ditindaklanjuti | Medium | High | Dashboard, SLA, escalation ke Puskesmas | Ops |
| RSK-005 | Clinical week/rule salah | Medium | Critical | Versioned configurable rules + approval | Clinical |
| RSK-006 | Cross-area health-data exposure | Medium | Critical | Backend authorization + negative tests | Security |
| RSK-007 | Kode unik bocor/diterka | Medium | High | Random code, hash, throttling, revocation | Security |
| RSK-008 | URL `wa.me` membocorkan data sensitif | Medium | High | Minimal template; tanpa diagnosis/NIK/risk detail | Security |
| RSK-009 | Program predicate salah tafsir sebagai diagnosis | Medium | High | Label administrative only + rule approval | Product/Clinical |
| RSK-010 | Retention/privacy policy belum selesai | Medium | Critical | Legal review before production | Privacy |

## 13. Definition of MVP Success

MVP berhasil bila core K1–K8 berjalan end-to-end, reminder 3-hari berhenti setelah konfirmasi, push failure selalu menghasilkan fallback yang actionable, `wa.me` tidak pernah direpresentasikan sebagai delivery truth, Puskesmas dapat mengelola detail K1–K6, Bidan dapat konfirmasi dengan flow sederhana, dan seluruh negative authorization P0 lulus.
