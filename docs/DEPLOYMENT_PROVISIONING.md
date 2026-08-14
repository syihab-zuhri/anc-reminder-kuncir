# Staging & Production Deployment Provisioning Specification

> **Project:** Sistem Pengingat ANC Ibu Hamil
> **Document ID:** DOC-DEPLOYMENT-PROVISIONING
> **Version:** 1.0.0
> **Status:** Approved / Active
> **Related Tasks:** TASK-P7-001
> **References:** DOC-ENV, DOC-ARCH, DOC-RUNBOOK

## 1. Overview & Isolation Architecture

Dokumen ini mendefinisikan arsitektur penyediaan (_provisioning_), pengisolasian lingkungan (_environment isolation_), manajemen rahasia (_secrets management_), serta topologi jaringan untuk lingkungan Staging dan Production Sistem Pengingat ANC Ibu Hamil.

---

## 2. Infrastructure & Topology Baseline

```
                +---------------------------------------+
                |    HTTPS Load Balancer / Reverse Proxy|
                +-------------------|-------------------+
                                    |
            +-----------------------+-----------------------+
            |                                               |
+-----------v-----------+                       +-----------v-----------+
| Web App (@anc/web)    |                       | API Server (@anc/api) |
| Port 3000 (Stateless) |                       | Port 3001 (Stateless) |
+-----------------------+                       +-----------|-----------+
                                                            |
                                                +-----------v-----------+
                                                | PostgreSQL Engine     |
                                                | Port 5432 (Isolated)  |
                                                +-----------^-----------+
                                                            |
                                                +-----------|-----------+
                                                | Worker (@anc/worker)  |
                                                | Outbox Claim Engine   |
                                                +-----------------------+
```

### 2.1 Staging Environment Specs

- **Network Isolation:** Isolated Private VPC / Local Docker Container Network.
- **Database:** Dedicated PostgreSQL 17 (`anc_reminder_staging`).
- **Secrets Isolation:** Separate staging keys (`SESSION_SECRET`, `NIK_ENCRYPTION_KEY`, `PUSH_TOKEN_ENCRYPTION_KEY`). Staging keys MUST NOT be shared with development or production.

### 2.2 Production Environment Specs

- **Network Isolation:** Fully restricted VPC with private subnets for PostgreSQL and Worker; API & Web exposed via WAF / Reverse Proxy with HTTPS TLS 1.3 enforcement.
- **Database:** High-Availability Managed PostgreSQL 17 with automated failover and daily backups (RPO 24h, RTO 8h).
- **Secrets Management:** Cloud Secret Manager (e.g., AWS Secrets Manager / GCP Secret Manager / Vault). No plain-text secrets in repository or environment files.

---

## 3. Mandatory Secrets Checklist for Deployment (TASK-P7-001)

| Secret Name                 | Requirements / Constraints                           | Scope                 |
| :-------------------------- | :--------------------------------------------------- | :-------------------- |
| `SESSION_SECRET`            | Min 32-char random string                            | API, Web BFF          |
| `MOTHER_SESSION_SECRET`     | Min 32-char distinct random string                   | API                   |
| `IDEMPOTENCY_SECRET`        | Min 32-char distinct random string                   | API                   |
| `NIK_ENCRYPTION_KEY`        | CSPRNG 32-byte Base64 Key (Must be distinct per env) | API                   |
| `PUSH_TOKEN_ENCRYPTION_KEY` | CSPRNG 32-byte Base64 Key                            | API, Worker           |
| `FCM_SERVICE_ACCOUNT_JSON`  | Firebase Private Service Account Key JSON            | Worker                |
| `DATABASE_URL`              | Encrypted SSL Connection string (`sslmode=require`)  | API, Worker, Database |

---

## 4. Verification & Isolation Evidence

- **Environment Separation:** Verified that staging database, session keys, and encryption secrets are completely independent from local development (`.env.example`).
- **Network Access Control:** PostgreSQL and Worker outbox engine are bound to private networks and not exposed to public traffic.
- **Verification Suite:** `npm run rehearse:deployment` and `npm run verify` execute clean without reliance on hardcoded staging secrets.
