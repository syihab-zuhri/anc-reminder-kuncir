# Operational Monitoring & Alerting Specification

> **Project:** Sistem Pengingat ANC Ibu Hamil
> **Document ID:** DOC-OPS-MONITORING
> **Version:** 1.0.0
> **Status:** Approved / Active
> **Related Tasks:** TASK-P7-002, TASK-P7-007
> **References:** DOC-RUNBOOK, NFR-003, NFR-004, NFR-010

## 1. Overview & Objectives

Dokumen ini mendefinisikan arsitektur pemantauan (_monitoring_), batas indikator kinerja (_Service Level Indicators_ - SLI), target layanan (_Service Level Objectives_ - SLO), serta aturan dan ambang batas (_alert thresholds_) untuk komponen-komponen Sistem Pengingat ANC Ibu Hamil:

1. **Server API (`@anc/api`)**
2. **Background Reminder Worker (`@anc/worker`)**
3. **PostgreSQL Database Engine**
4. **Push Notification Adapter (FCM HTTP v1)**
5. **Fallback Escalation Queue (`wa.me`)**

---

## 2. Service Level Objectives (SLO) & Health Criteria

| Metric / Scope                 | Target SLO                  | Warning Threshold            | Critical Threshold           |
| :----------------------------- | :-------------------------- | :--------------------------- | :--------------------------- |
| **API Availability**           | 99.9% uptime per bulan      | Availability < 99.5% (5 min) | Availability < 99.0% (5 min) |
| **API P95 Latency**            | < 500 ms                    | P95 > 800 ms (5 min)         | P95 > 2000 ms (5 min)        |
| **API Error Rate**             | < 0.1% HTTP 5xx             | Error rate > 1.0%            | Error rate > 5.0%            |
| **Worker Heartbeat**           | Active execution            | Heartbeat delay > 5 min      | Heartbeat delay > 15 min     |
| **Worker Scheduler Lag**       | < 5 min                     | Lag > 15 min                 | Lag > 60 min                 |
| **Push Delivery Success Rate** | > 95% (excluding bad token) | Success rate < 90%           | Success rate < 80%           |
| **WA Fallback Backlog SLA**    | Unresolved < SLA (24h)      | Unresolved > 24h count > 5   | Unresolved > 48h count > 20  |
| **DB Connection Pool Usage**   | < 70% capacity              | Pool usage > 80%             | Pool usage > 95%             |

---

## 3. Detailed Metric Definitions & Monitoring Rules

### 3.1 API Server (`@anc/api`)

- **Endpoints & Health Check**:
  - Liveness Endpoint: `GET /health/liveness` (Harus mengembalikan HTTP 200 `{"status": "OK"}`)
  - Readiness Endpoint: `GET /health/readiness` (Memeriksa koneksi DB & environment readiness)
- **Monitoring Metrics**:
  - `http_requests_total{status, method, route}`
  - `http_request_duration_seconds{route}`
  - `auth_failures_total{reason, ip}` (Terintegrasi dengan audit log & rate-limiting)

### 3.2 Background Reminder Worker (`@anc/worker`)

- **Job Outbox Engine**:
  - Outbox Claims: Menggunakan `FOR UPDATE SKIP LOCKED` pada PostgreSQL.
  - Cycle Anchor: Menggunakan `PRIMARY_TIMEZONE` (Asia/Jakarta) dengan batasan `REMINDER_INTERVAL_DAYS`.
- **Worker Alerting Triggers**:
  - **Worker Dead Check**: Jika worker tidak memproses siklus pengingat selama > 15 menit saat antrean pending > 0.
  - **Scheduler Lag Alert**: Jika siklus terjadwal terlambat diproses melebihi threshold SLA.

### 3.3 Push Notification Delivery (FCM HTTP v1)

- **Handling Failure & Classification**:
  - **Success (`200 OK`)**: Siklus ditandai `COMPLETED`.
  - **Retryable Errors (`429`, `500`, `503`, `UNAVAILABLE`)**: Diberikan backoff + jitter berdasarkan `PUSH_BACKOFF_SECONDS`.
  - **Terminal Failures (`UNREGISTERED`, `INVALID_ARGUMENT`, `THIRD_PARTY_AUTH_ERROR`)**: Token invalid ditandai non-aktif (`is_active = false`), dan antrean eskalasi manual `wa.me` otomatis dibuat.
- **Alert Trigger**:
  - Lonjakan _Terminal Failure_ (> 10% dari total klaim push per jam) mengindikasikan masalah kredensial FCM atau perubahan App ID/Push Certificate.

### 3.4 Fallback Escalation Queue (`wa.me`)

- **No WhatsApp Delivery Claim**:
  - Sistem **TIDAK PERNAH** mengklaim pesan WhatsApp terkirim secara otomatis. Membuka link `wa.me` hanya mencatat aksi manual petugas.
- **Escalation SLA Monitoring**:
  - API Summary `GET /api/v1/reminders/summary` menghitung umur antrean pengingat fallback.
  - Jika fallback tidak ditindaklanjuti melebihi `WA_FALLBACK_ESCALATION_HOURS` (default 24 jam), indikator `sla_exceeded = true` aktif dan muncul pada dashboard Puskesmas.

---

## 4. Incident Response & Escalation Matrix

| Severity          | Definition                                                              | Action Required                                                                 | Response SLA |
| :---------------- | :---------------------------------------------------------------------- | :------------------------------------------------------------------------------ | :----------- |
| **P1 - Critical** | Server API down, DB unreachable, atau data corruption.                  | Tangani segera (Containment + Emergency Hotfix/Rollback). Preservasi audit log. | < 15 Menit   |
| **P2 - High**     | Worker terhenti, lonjakan kegagalan push FCM, atau masalah auth meluas. | Restart worker instance / periksa kredensial FCM Service Account.               | < 1 Jam      |
| **P3 - Medium**   | Penumpukan antrean fallback `wa.me` melebihi SLA 24 jam di Puskesmas.   | Eskalasi ke Puskesmas Operations untuk penanganan manual Bidan/Petugas.         | < 4 Jam      |
| **P4 - Low**      | Isu minor UI, keterlambatan tampilan non-kritis.                        | Ditangani pada siklus pemeliharaan rutin.                                       | < 24 Jam     |

---

## 5. Capacity & Scaling Triggers (TASK-P7-007)

- **Scale-Up Triggers**:
  - CPU Utilization > 70% selama 10 menit berturut-turut.
  - Memory Utilization > 80%.
  - PostgreSQL Connection Pool Utilization > 80%.
- **Scale-Out Action**:
  - Tambah instance API stateless di belakang Load Balancer.
  - Worker menggunakan model konkurensi terisolasi dengan DB lock safe (`SKIP LOCKED`), aman untuk di-scale horizontal.
