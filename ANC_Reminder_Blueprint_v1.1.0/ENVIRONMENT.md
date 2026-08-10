# Environment & Configuration

> **Project:** Sistem Pengingat ANC Ibu Hamil  
> **Document ID:** DOC-ENV  
> **Version:** 1.1.0  
> **Status:** Review  
> **Owner:** DevOps Lead  
> **Last Updated:** 2026-08-10  
> **Depends On:** DOC-ARCH

## 1. Principles

No secrets in repository/docs. Validate required variables at startup. Separate dev/staging/production.

## 2. Proposed Variables

| Variable | Required | Description |
|---|---:|---|
| `NODE_ENV` | Yes | `development`, `test`, atau `production` |
| `DATABASE_URL` | Yes | PostgreSQL connection |
| `API_HOST` | API env | Bind host; default local/container `0.0.0.0` |
| `API_PORT` | API env | Bind port; default `3001` |
| `APP_BASE_URL` | Yes | Trusted web origin |
| `API_BASE_URL` | Yes | API origin |
| `SESSION_SECRET` | Yes | Server session signing/encryption secret |
| `MOTHER_SESSION_SECRET` | Yes | Restricted mother session secret |
| `IDEMPOTENCY_SECRET` | Yes | Dedicated HMAC secret for request fingerprints; distinct from session secrets |
| `NIK_ENCRYPTION_KEY` | API env | Dedicated base64-encoded 32-byte AES-256-GCM key for restricted NIK ciphertext; distinct from session/idempotency secrets |
| `STAFF_ACCESS_TOKEN_TTL_MINUTES` | API env | Staff access-token lifetime; default `15` |
| `STAFF_REFRESH_TOKEN_TTL_DAYS` | API env | Staff refresh-token lifetime; default `7` |
| `STAFF_LOGIN_MAX_FAILURES` | API env | Consecutive failures before lock; default `5` |
| `STAFF_LOGIN_LOCK_MINUTES` | API env | Persistent lock duration; default `15` |
| `MOTHER_SESSION_TTL_DAYS` | API env | Restricted mother-session lifetime; default `30` |
| `MOTHER_ACCESS_IP_MAX_FAILURES` | API env | Mother validation failures per HMAC IP bucket/window; default `10` |
| `MOTHER_ACCESS_CODE_MAX_FAILURES` | API env | Mother validation failures per HMAC code bucket/window; default `5` |
| `MOTHER_ACCESS_RATE_WINDOW_MINUTES` | API env | Durable mother access failure window; default `15` |
| `MOTHER_ACCESS_BLOCK_MINUTES` | API env | Mother access block duration after threshold; default `15` |
| `FCM_PROJECT_ID` | Push env | FCM project |
| `FCM_SERVICE_ACCOUNT_JSON` or secret reference | Push env | FCM credential; never commit |
| `REMINDER_INTERVAL_DAYS` | Yes | Default `3` |
| `PUSH_MAX_ATTEMPTS` | Yes | `PROPOSED` default `3` |
| `PUSH_BACKOFF_SECONDS` | Yes | Configurable retry schedule |
| `WA_FALLBACK_ESCALATION_HOURS` | Yes | `TBD` operational SLA |
| `PRIMARY_TIMEZONE` | Yes | `Asia/Jakarta` |
| `LOG_LEVEL` | Yes | Environment-specific |
| `SENTRY_DSN`/error tool | Optional | If selected |
| `CAPACITOR_SERVER_URL` | Android build/runtime | Trusted WebView origin; HTTPS outside local development |

No WhatsApp API key/token exists in MVP configuration.

Production requires HTTPS for `APP_BASE_URL`, `API_BASE_URL`, and remote PostgreSQL TLS (`sslmode=require`, `verify-ca`, or `verify-full`). Session/idempotency secrets are at least 32 characters and all must be distinct. `REMINDER_INTERVAL_DAYS` is validated as the confirmed value `3`.

## 3. `.env.example`

```dotenv
NODE_ENV=development
DATABASE_URL=postgresql://anc_dev:anc_dev@localhost:5432/anc_reminder
API_HOST=0.0.0.0
API_PORT=3001
APP_BASE_URL=http://localhost:3000
API_BASE_URL=http://localhost:3001/api/v1
SESSION_SECRET=replace-with-at-least-32-random-characters
MOTHER_SESSION_SECRET=replace-with-a-different-32-character-secret
IDEMPOTENCY_SECRET=replace-with-a-third-distinct-32-character-secret
NIK_ENCRYPTION_KEY=replace-with-a-base64-encoded-32-byte-key
STAFF_ACCESS_TOKEN_TTL_MINUTES=15
STAFF_REFRESH_TOKEN_TTL_DAYS=7
STAFF_LOGIN_MAX_FAILURES=5
STAFF_LOGIN_LOCK_MINUTES=15
MOTHER_SESSION_TTL_DAYS=30
MOTHER_ACCESS_IP_MAX_FAILURES=10
MOTHER_ACCESS_CODE_MAX_FAILURES=5
MOTHER_ACCESS_RATE_WINDOW_MINUTES=15
MOTHER_ACCESS_BLOCK_MINUTES=15
FCM_PROJECT_ID=
FCM_SERVICE_ACCOUNT_JSON=
REMINDER_INTERVAL_DAYS=3
PUSH_MAX_ATTEMPTS=3
PUSH_BACKOFF_SECONDS=60,300,900
# Synthetic local value only; production SLA remains OPEN-OPS-001.
WA_FALLBACK_ESCALATION_HOURS=24
PRIMARY_TIMEZONE=Asia/Jakarta
LOG_LEVEL=info
CAPACITOR_SERVER_URL=http://localhost:3000
```

## 4. Environment Differences

Dev uses synthetic data; staging uses isolated credentials/DB; production has restricted secret access, monitoring, backups, TLS.

## 5. Local Setup Checklist

Database available → migrations → seed synthetic care-plan version → server config validation → web → worker → optional Android shell/FCM test.

## 6. Secret Rotation Ownership

DevOps owns infrastructure/FCM/session/idempotency/NIK-encryption-key rotation with Backend support. Rotation procedure must avoid invalidating active sessions unexpectedly unless incident response requires it. Rotating `MOTHER_SESSION_SECRET` invalidates every mother bearer and also changes credential lookup hashes; all active mother codes must therefore be explicitly reissued under the new secret as part of a reviewed maintenance plan. After `IDEMPOTENCY_SECRET` rotation, reuse of a pre-rotation key fails closed as HTTP `409`; reconcile the original resource before issuing a new key. NIK-key rotation requires a reviewed decrypt-and-re-encrypt migration before the retiring key is removed.

## 7. Seed Policy

No real Bumil data. Seed rule weeks are clearly marked test-only until clinical approval.

## 8. Initial Puskesmas Provisioning

`PROVISION_CONFIRM`, `PROVISION_HEALTH_CENTER_CODE`, `PROVISION_HEALTH_CENTER_NAME`,
`PROVISION_LOGIN_IDENTIFIER`, `PROVISION_DISPLAY_NAME`, and `PROVISION_PASSWORD` are transient
operator inputs for `npm run staff:provision:puskesmas`; they are deliberately absent from
`.env.example`. Use a secret manager or ephemeral process environment, clear the password after use,
and never place production values in repository files.
