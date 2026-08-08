# Project Manifest

> **Project:** Sistem Pengingat ANC Ibu Hamil  
> **Document ID:** DOC-MANIFEST  
> **Version:** 1.1.0  
> **Status:** Review  
> **Owner:** Product/Project Lead  
> **Last Updated:** 2026-08-08  
> **Depends On:** None

## 1. Purpose

Registry resmi seluruh artefak blueprint. Authority keputusan mengikuti source-of-truth matrix di `PLANNING.md`; dokumen turunan tidak boleh mengalahkan keputusan user terbaru.

## 2. Project Snapshot

| Field | Value |
|---|---|
| Project key | `ANC-REMINDER` |
| Stage | Implementation — Phase-0 foundation verified locally |
| Current gate | `Gate C — Implementation Ready` |
| Delivery surfaces | Responsive Web + Android WebView |
| Primary staff clients | Web untuk Puskesmas dan Bidan |
| Primary mother client | Android WebView; browser dapat digunakan sebagai fallback bila diizinkan |
| Architecture | Server-driven thin clients + NestJS modular monolith + PostgreSQL-backed worker |
| Database | PostgreSQL |
| Push channel | Firebase Cloud Messaging (FCM) |
| WhatsApp fallback | Manual petugas melalui server-generated `wa.me` |
| Primary timezone | `Asia/Jakarta` |
| Data sensitivity | `Restricted — personal and pregnancy-related health data` |
| Clinical function | Administrative reminder/monitoring; bukan diagnosis/clinical decision support |

## 3. Confirmed Decisions

| ID | Decision | Status |
|---|---|---|
| DEC-001 | Bumil masuk menggunakan **nama + kode unik**. | `CONFIRMED` |
| DEC-002 | Business logic, authorization, perhitungan, status, dan reminder decision berada di server. | `CONFIRMED` |
| DEC-003 | Produk dikirim sebagai **Web + Android WebView**. | `CONFIRMED` |
| DEC-004 | Reminder eligible berulang setiap **3 hari** selama kunjungan yang jatuh tempo belum dikonfirmasi. | `CONFIRMED` |
| DEC-005 | Push Android dicoba lebih dahulu; kegagalan terminal membuat fallback WhatsApp manual. | `CONFIRMED` |
| DEC-006 | WhatsApp MVP menggunakan `wa.me`; petugas tetap menekan Kirim. | `CONFIRMED` |
| DEC-007 | `wa.me` tidak menyediakan delivery/read/failure callback; sistem dilarang mengklaim `SENT/DELIVERED/FAILED` dari link. | `CONFIRMED TECHNICAL CONSTRAINT` |
| DEC-008 | Bidan hanya melakukan konfirmasi sederhana “Sudah Periksa” untuk milestone yang menjadi kewenangannya. | `CONFIRMED` |
| DEC-009 | Puskesmas memiliki seluruh kewenangan Bidan dan mengelola detail pencatatan K1–K6. | `CONFIRMED` |
| DEC-010 | K1/K4/K5 wajib Puskesmas; K2/K3/K6/K7 fleksibel sesuai fasilitas yang diizinkan; K8 adalah milestone persalinan PONED/RS. | `CONFIRMED PROJECT RULE` |
| DEC-011 | K1–K8 adalah milestone/urutan kunjungan, bukan nama trimester. | `CONFIRMED` |
| DEC-012 | Bumil tidak dapat mengonfirmasi sendiri bahwa pemeriksaan telah dilakukan. | `CONFIRMED` |

## 4. Document Registry

| Document | ID | Version | Status | Owner | Authoritative Domain |
|---|---|---:|---|---|---|
| `PROJECT_MANIFEST.md` | DOC-MANIFEST | 1.1.0 | Review | Product/Project Lead | Registry |
| `PLANNING.md` | DOC-PLANNING | 1.0.0 | Review | Product Owner | Vision/scope/milestones |
| `SRS.md` | DOC-SRS | 1.1.0 | Review | Product + Architect | FR/NFR/business constraints |
| `PRD/_INDEX.md` | DOC-PRD-INDEX | 1.0.0 | Review | Product Owner | Feature registry |
| `PRD/STAFF_ACCESS.md` | PRD-STAFF | 1.0.0 | Review | Product + Security | Staff access behavior |
| `PRD/MOTHER_REGISTRY.md` | PRD-REGISTRY | 1.1.0 | Review | Product Owner | Registry |
| `PRD/MOTHER_PRIVATE_ACCESS.md` | PRD-MOTHER-ACCESS | 1.0.0 | Review | Product + Security | Bumil access |
| `PRD/ANC_CARE_PLAN.md` | PRD-ANC | 1.0.0 | Review | Clinical/Program Owner | K1–K8 behavior |
| `PRD/CHECKUP_TRACKING.md` | PRD-CHECKUP | 1.0.0 | Review | Product + Clinical | Confirmation and validation |
| `PRD/NOTIFICATION_AUTOMATION.md` | PRD-NOTIF | 1.0.0 | Review | Product Owner | Reminder lifecycle |
| `PRD/DASHBOARD.md` | PRD-DASHBOARD | 1.0.0 | Review | Product Owner | Role dashboards |
| `PRD/PROGRAM_STATUS.md` | PRD-PROGRAM | 1.0.0 | Review | Clinical/Program Owner | Sigizi Kesga / Hak Janin assessment |
| `PRD/CONTENT_MANAGEMENT.md` | PRD-CONTENT | 1.0.0 | Review | Clinical/Program Owner | Approved content |
| `PERMISSION.md` | DOC-PERMISSION | 1.0.0 | Review | Security Architect | Authorization |
| `ERD.md` | DOC-ERD | 1.1.0 | Review | Data Architect | Data model |
| `API.md` | DOC-API | 1.1.0 | Review | Backend Lead | REST contract |
| `ARCHITECTURE.md` | DOC-ARCH | 1.0.0 | Review | Software Architect | System topology |
| `SECURITY.md` | DOC-SECURITY | 1.1.0 | Review | Security Reviewer | Threats/controls/privacy |
| `DSD.md` | DOC-DSD | 1.1.0 | Review | UX Lead | UX/design system |
| `TESTING.md` | DOC-TESTING | 1.1.0 | Review | QA Lead | Verification |
| `TASKS.md` | DOC-TASKS | 1.1.0 | Review | Engineering Lead | Execution |
| `ENVIRONMENT.md` | DOC-ENV | 1.1.0 | Review | DevOps Lead | Configuration |
| `RUNBOOK.md` | DOC-RUNBOOK | 1.0.0 | Review | DevOps Lead | Operations |
| `ADR/ADR-001-MOTHER-ACCESS.md` | ADR-001 | 1.0.0 | Accepted | Architect + Security | Name + unique-code access |
| `ADR/ADR-002-NOTIFICATION-ROUTING.md` | ADR-002 | 1.0.0 | Superseded | Architect | Old routing decision |
| `ADR/ADR-003-ANC-SCHEDULING.md` | ADR-003 | 1.0.0 | Superseded | Architect + Clinical | Old K1–K6 decision |
| `ADR/ADR-004-SUPER-ADMIN-ACCESS.md` | ADR-004 | 1.0.0 | Proposed | Security Architect | Break-glass |
| `ADR/ADR-005-SERVER-DRIVEN-WEBVIEW.md` | ADR-005 | 1.0.0 | Accepted | Architect | Server-driven Web/WebView |
| `ADR/ADR-006-PUSH-WAME-FALLBACK.md` | ADR-006 | 1.0.0 | Accepted | Architect + Product | Push retry + manual `wa.me` |
| `ADR/ADR-007-K1-K8-PROGRAM-MODEL.md` | ADR-007 | 1.0.0 | Accepted | Architect + Clinical | K1–K8 + program assessment |
| `TRACEABILITY.md` | DOC-TRACE | 1.1.0 | Review | QA Lead | P0 coverage |
| `VALIDATION_REPORT.md` | DOC-VALIDATION-REPORT | 1.1.0 | Review | Project Planning Lead | Cross-document validation evidence |
| `CHANGELOG.md` | DOC-CHANGELOG | 1.1.0 | Review | Product/Project Lead | Change history |
| `agent.md` | DOC-AGENT | 1.1.0 | Review | Project Planning Lead | Handoff |

## 5. Deferred or Skipped Deliverables

| Deliverable | Status | Reason | Revisit Trigger |
|---|---|---|---|
| `openapi.yaml` | Deferred | Payload shape masih Review; `API.md` menjadi contract sementara. | API review selesai dan schema stabil. |
| `MIGRATION.md` | Skipped | Belum ada legacy system/import dataset yang dikonfirmasi. | Data lama harus diimpor. |
| WhatsApp Business API integration | Out of Scope MVP | User memilih `wa.me` manual setelah push gagal. | Kebutuhan WhatsApp benar-benar otomatis. |
| Offline-first workflow | P2 | Server adalah source of truth; sync offline menambah konflik. | Field operation membutuhkan offline. |
| Microservices | Skipped | Tidak ada scale/team driver. | Scale trigger di `ARCHITECTURE.md` tercapai. |

## 6. Open Questions / Approval Blockers

Tidak ada pertanyaan material tambahan untuk user saat ini. Berikut bukan blocker implementasi core, tetapi wajib diselesaikan sebelum production:

| ID | Question | Owner |
|---|---|---|
| OPEN-CLIN-001 | Tetapkan rentang minggu/target tanggal final K1–K8 dan komponen wajib K1–K6. | Clinical/Program Owner |
| OPEN-CLIN-002 | Setujui rule final “Pencatatan Sigizi Kesga” dan “Memenuhi Hak Janin”. | Clinical/Program Owner |
| OPEN-LEGAL-001 | Retention, lawful basis/consent, privacy notice, deletion/restriction process. | Privacy/Legal |
| OPEN-SCALE-001 | Jumlah Bumil aktif, petugas concurrent, device aktif, dan reminder per bulan. | Product/Operations |
| OPEN-OPS-001 | SLA fallback `wa.me` yang belum ditindaklanjuti. | Puskesmas Operations |
| OPEN-REPO-001 | Remote private tersedia dan hosted CI lulus; aktifkan GitHub Pro atau setujui repository public agar branch protection dapat diterapkan. | Product/DevOps |

## 7. Readiness Report

- Documentation completeness: **100% untuk blueprint P0 yang direncanakan**
- P0 traceability: **Pass (document coverage); Phase-0 foundation evidence verified locally and in hosted CI, business implementation pending**
- Security baseline: **Foundation controls verified locally; authorization/business security implementation pending**
- Deployment readiness: **Not Ready — remaining implementation and rehearsal pending**
- Blocking open questions for implementation: **0**
- Blocking open questions for production: **5**
- Current gate: **Gate C — Implementation Ready**
- Recommended next agent: **Phase 1 Staff Auth + Organization/Scope + Authorization**, dengan keputusan branch protection paralel
