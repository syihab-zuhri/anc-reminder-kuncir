# Environment & Configuration

> **Project:** Sistem Pengingat ANC Ibu Hamil  
> **Document ID:** DOC-ENV  
> **Version:** 1.1.0  
> **Status:** Review  
> **Owner:** DevOps Lead  
> **Last Updated:** 2026-08-08  
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

Production requires HTTPS for `APP_BASE_URL`, `API_BASE_URL`, and remote PostgreSQL TLS (`sslmode=require`, `verify-ca`, or `verify-full`). Session secrets are at least 32 characters and must be distinct. `REMINDER_INTERVAL_DAYS` is validated as the confirmed value `3`.

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

DevOps owns infrastructure/FCM/session secret rotation with Backend support. Rotation procedure must avoid invalidating active sessions unexpectedly unless incident response requires it.

## 7. Seed Policy

No real Bumil data. Seed rule weeks are clearly marked test-only until clinical approval.
