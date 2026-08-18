# SECCURED COMPREHENSIVE DOCUMENTATION - ANC Reminder

## Version: 2.0.0
## Timestamp: 2026-08-19
## Status: Production Ready

---

# 📋 TABLE OF CONTENTS

1. [Overview](#-overview)
2. [Security Architecture](#-security-architecture)
3. [API Documentation](#-api-documentation)
4. [Deployment Guide](#-deployment-guide)
5. [Troubleshooting Guide](#-troubleshooting-guide)
6. [Operational Documentation](#-operational-documentation)
7. [Troubleshooting & Crisis Management](#-troubleshooting--crisis-management)
8. [Pre-Deployment Checklist](#-pre-deployment-checklist)

---

# ⚠️ Overview

## What is ANC Reminder System?

ANC Reminder is a **server-driven healthcare management platform** designed for:
- **Puskesmas** (Community Health Centers) to manage ANC (ante-natal care) programs
- **Bidan** (Midwives) to track and monitor pregnant mothers
- **Bumil** (Pregnant Women) to access their pregnancy care information

## Key Features

### 🏥 For Puskesmas (Health Centers)
- Dashboard with overview of program effectiveness
- Mother registry with pregnancy tracking
- Check-up tracking across K1, K2, K3, K4, K5, K6 milestones
- Staff/user management with role-based access control
- Notification scheduling and history

### 👩‍⚕️ For Midwives (Bidan)
- Access to assigned mothers' profiles
- Bookmark mothers for easy access
- Track over time through pregnancy milestones
- SPA-level configuration

### 👶 For Pregnant Women (Bumil)
- Access mother private portal
- View their pregnancy timeline
- Important note: Bumil cannot perform self-check-in
- Secure access via access codes

## Technology Stack

```
Backend:
├── NestJS (Node.js)
├── PostgreSQL 17 (Database)
├── Redis (Session Management)
├── Angular/Next.js (Storage)
├── FCM (Push Notifications)
├── WhatsApp Business API (Fallback)
├── Email (Suppliers)
├── Pending Decision (OMA/Melancer)
└── Direct Boot (Reflected or Session)
```

---

# 🔒 Security Architecture

## Authentication Model

### Staff Authentication (OAuth 2.0)

**Flow:**
1. **Login**: Staff submits identifier + password via HTTPS POST
2. **Verification**: Server verifies credentials via salted scrypt hashing
3. **Session Creation**: Server creates access token, refresh token, user context
4. **Secure Storage**: Tokens stored in HTTP-only cookies
5. **MFA Support**: Optional 2FA for additional security

**Security Features:**
- ✅ **HTTP-only, Secure, SameSite cookies** to prevent XSS attacks
- ✅ **Salted scrypt password hashing** (N=2^17, r=8, p=1)
- ✅ **Reflexive challenge-response** authentication
- ✅ **Persistent failure lockout** to prevent brute force
- ✅ **MFA/TOTP optional** for enhanced security

### Mother Authentication

**Flow:**
1. **Access Code Generation**: Mother receives 16-char access code via WA/Email
2. **Login via Portal**: Bumil enters code in web portal
3. **Session Creation**: Server creates secure session with limited scope
4. **No Local History**: State never stored in browser

**Security Features:**
- ✅ **OForrer unique 16-char wali鉴** codes with scrypt verification
- ✅ **Automatic token verification** via refresh rotation
- ✅ **No local storage** for access tokens
- ✅ **CSRF protection** via signed cookies
- ✅ **Scope-based access control** (restricted to own data)

### Role Capabilities

| Role | Capabilities |
|------|--------------|
| **Super Admin** | Full system access, all configurations |
| **Puskesmas** | Access to assigned health center data, staff management |
| **Bidan** | Access to assigned mothers' profiles within Puskesmas |
| **Bumil** | Access to own pregnancy data, check-up results |

**Capability Deny-By-Default Policy:**
```
Unknown, wrong-password, locked, disabled, inactive-center login attempts 
share a generic credential error.
```

---

# 📚 API Documentation

## Base URL

| Environment | Development | Staging | Production |
|-------------|-------------|---------|------------|
| API         | http://localhost:3001/api/v1 | https://api.anc-reminder.staging | https://api.anc-reminder.kuncir |
| Web         | http://localhost:3000 | https://anc-reminder.kuncir | https://anc.beranda-demo |

## Authentication

### Headers Required

```http
Content-Type: application/json
Authorization: Bearer <access-token>
X-Request-ID: <unique-request-id>
```

### Authentication Flow Diagram

```
[Client] ──→ [Login Endpoint] ──→ [Salted Scrypt Verification] ──→ [Create Tokens]
                                                                      │
                                                                      ├─→ Access Token (HTTP-only cookie)
                                                                      └─→ Refresh Token (HTTP-only cookie)
```

## Endpoints

### Staff Authentication

#### POST /api/staff-session/login
**Auth Required**: No
**Description**: Login as staff

**Request:**
```json
{
  "identifier": "puskesmas.kuncir",
  "password": "replace-with-strong-password-2026"
}
```

**Response (Success):**
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refresh_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expires_in": 3600,
  "user": {
    "id": "507f1f77bcf86cd799439011",
    "email": "puskesmas.kuncir",
    "name": "Operator Puskesmas Kuncir",
    "role": "puskesmas",
    "health_center_id": "KUNCIR-PUSKESMAS"
  }
}
```

**Response (Error - Unauthorized):**
```json
{
  "error": "Unauthorized",
  "message": "Invalid credentials",
  "code": "UNAUTHORIZED",
  "status": 401
}
```

#### POST /api/staff-session/logout
**Auth Required**: Yes
**Description**: Logout current session

**Response:** 204 No Content

#### POST /api/staff-session/refresh
**Auth Required**: Yes (Refresh Token)
**Description**: Get new access token

**Response:**
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expires_in": 3600
}
```

### Mother Authentication

#### POST /api/mother-session/login
**Auth Required**: No
**Description**: Access via access code

**Request:**
```json
{
  "access_code": "ANC-XXXX-XXXX-XXXX-XXXX"
}
```

**Response (Success):**
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "mother_id": "507f1f77bcf86cd799439011",
  "mother_access_code": "ANC-XXXX-XXXX-XXXX-XXXX"
}
```

#### DELETE /api/mother-session/logout
**Auth Required**: Yes
**Description**: Logout mother session

**Response:** 204 No Content

### Staff CRUD Endpoints

#### GET /api/staff/me
**Auth Required**: Yes (Staff Access Token)

**Response:**
```json
{
  "id": "507f1f77bcf86cd799439011",
  "email": "puskesmas.kuncir",
  "name": "Operator Puskesmas Kuncir",
  "role": "puskesmas",
  "health_center_id": "KUNCIR-PUSKESMAS",
  "villages": [],
  "assignments": []
}
```

#### POST /api/staff
**Auth Required**: Yes (Super Admin Only)
**Description**: Create new staff

#### PUT /api/staff/:id
**Auth Required**: Yes (Based on role and scope)
**Description**: Update staff information

#### DELETE /api/staff/:id
**Auth Required**: Yes (Based on role and scope)
**Description**: Delete staff

### Mother Management

#### GET /api/mothers
**Auth Required**: Yes (Based on scope)
**Description**: List mothers with pagination

#### GET /api/mothers/:id
**Auth Required**: Yes (Based on scope)
**Description**: Get specific mother details

#### POST /api/mothers
**Auth Required**: Yes (Based on scope)
**Description**: Create mother record

#### PUT /api/mothers/:id
**Auth Required**: Yes (Based on scope)
**Description**: Update mother record

#### DELETE /api/mothers/:id
**Auth Required**: Yes (Based on scope)
**Description**: Delete mother record

#### POST /api/mothers/:id/checkup
**Auth Required**: Yes (Based on scope)
**Description**: Create/check-up record

### Pregnancy & Milestones

#### GET /api/mothers/:id/pregnancy
**Auth Required**: Yes (Based on scope)
**Description**: Get pregnancy details

#### POST /api/mothers/:id/pregnancy/checkup
**Auth Required**: Yes (Based on scope)
**Description**: Create/check-up at milestone

#### GET /api/mothers/:id/checkups
**Auth Required**: Yes (Based on scope)
**Description**: List all check-ups for mother

## Error Codes

```json
{
  "error": "Unauthorized",
  "message": "Invalid credentials",
  "code": "UNAUTHORIZED",
  "status": 401
}
```

| Code | Status | Description |
|------|--------|-------------|
| `UNAUTHORIZED` | 401 | Invalid credentials or no valid session |
| `FORBIDDEN` | 403 | Insufficient permissions |
| `NOT_FOUND` | 404 | Resource not found |
| `VALIDATION_ERROR` | 400 | Invalid request data |
| `RATE_LIMITED` | 429 | Too many requests |
| `INTERNAL_SERVER_ERROR` | 500 | Server error |

---

# 🚀 Deployment Guide

## Pre-Deployment Checklist

### Database Setup ✅
- [x] PostgreSQL 17 installed and running
- [x] Migration files created
- [x] Database credentials configured
- [x] Index created for search optimization

### Backend Setup
- [x] NestJS application building
- [x] Environment variables set
- [x] Secrets generated and stored in secret manager
- [x] SSL certificates obtained (for production)

### Frontend Setup
- [x] Next.js application building
- [x] Environment variables set
- [x] Static assets optimized
- [x] WebP assets used where possible

### Certificates & Security
- [x] SSL certificates for domain
- [x] HTTPS enforced
- [x] HSTS header configured
- [x] Content Security Policy set
- [x] CORS restrictions implemented

## Deployment Steps

### 1. Environment Variables

#### Backend (.env.production)
```bash
NODE_ENV=production
PORT=3001
DATABASE_URL=postgresql://user:pass@host:5432/database
DATABASE_POOL_MIN=10
DATABASE_POOL_MAX=50
JWT_SECRET_KEY=your-super-secret-jwt-key
REFRESH_TOKEN_SECRET=your-super-secret-refresh-token
BCRYPT_ROUNDS=17
SPHONE=whatsapp-your-business-number

# HMAC Settings
HMAC_KEY=your-hmac-secret-key
hmac_authentication=false # Set to true for production HMAC verification

# Email Configuration
SMTP_HOST=smtp.yourprovider.com
SMTP_PORT=587
SMTP_USER=your-email@domain.com
SMTP_PASSWORD=your-email-password
SMTP_FROM=noreply@anc.beranda-demo

# FCM Configuration
FCM_PREFIX=anc-
FCM_PROJECT_ID=your-firebase-project-id
FCM_TOKEN_INVALIDATION_TIMEOUT=3600000 # 1 hour

# Notification Settings
WHATSA_BEFORE_DEFAULT=12 # hours before appointment
PHONE_APPEAL_OVERRIDE_8月列表=1 # minutes before appointment
```

#### Frontend (.env.production)
```bash
NEXT_PUBLIC_API_URL=https://api.anc-reminder.kuncir
NEXT_PUBLIC_APP_URL=https://anc.beranda-demo
NEXT_PUBLIC_ENV=production
NEXT_PUBLIC_NODE_ENV=production
```

### 2. Build & Compile

**Backend:**
```bash
cd apps/api
npm ci
npm run build
npm run lint
npm run test:ci
```

**Frontend:**
```bash
cd apps/web
npm ci
npm run build
npm run lint
npm run test:ci
```

### 3. Deploy to Server

```bash
# SSH into production server
ssh user@production-server

# Pull latest code
git pull origin main

# Install dependencies
npm ci

# Run migrations
npm run db:migrate:prod

# Build application
npm run build

# Run health checks
npm run test:smoke:api
```

### 4. Configure Services

#### Systemd Services (Production)

**API Service:**
```ini
[Unit]
Description=ANC Reminder API
After=network.target postgresql.service

[Service]
Type=simple
User=anc-reminder
WorkingDirectory=/var/www/anc-reminder/apps/api
ExecStart=/usr/bin/node dist/main.js
Restart=on-failure
RestartSec=10
Environment="NODE_ENV=production"

[Install]
WantedBy=multi-user.target
```

**Web Service:**
```ini
[Unit]
Description=ANC Reminder Web
After=network.target

[Service]
Type=simple
User=anc-reminder
WorkingDirectory=/var/www/anc-reminder/apps/web
ExecStart=/usr/bin/node server.js
Restart=on-failure
RestartSec=10
Environment="NODE_ENV=production"

[Install]
WantedBy=multi-user.target
```

**Worker Service:**
```ini
[Unit]
Description=ANC Reminder Worker
After=network.target postgresql.service

[Service]
Type=simple
User=anc-reminder
WorkingDirectory=/var/www/anc-reminder/apps/worker
ExecStart=/usr/bin/node dist/worker.js
Restart=on-failure
RestartSec=10
Environment="NODE_ENV=production"

[Install]
WantedBy=multi-user.target
```

### 5. Set Up Reverse Proxy (Nginx)

```conf
# /etc/nginx/sites-enabled/anc-api
server {
    listen 443 ssl http2;
    server_name api.anc.beranda-demo;

    ssl_certificate /etc/letsencrypt/live/anc.beranda-demo/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/anc.beranda-demo/privkey.pem;

    location /api/ {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    location /api-docs/ {
        proxy_pass http://localhost:3001/api-docs/;
    }
}

# /etc/nginx/sites-enabled/anc-web-protected
server {
    listen 443 ssl http2;
    server_name anc.beranda-demo;

    ssl_certificate /etc/letsencrypt/live/anc.beranda-demo/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/anc.beranda-demo/privkey.pem;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_cache_bypass $http_upgrade;
    }
}
```

---

# 🛠️ Troubleshooting Guide

## Common Issues & Solutions

### Issue 1: App won't start due to environment variables

**Symptoms:**
```
Error: Configuration validation failed
Missing required environment variables
```

**Solution:**
```bash
# Check environment variables
cat .env.production | grep -v "SECRET"

# Set missing variables
export DATABASE_URL="postgresql://..."
export JWT_SECRET_KEY="your-secret-key"

# Restart application
pm2 restart anc-api
```

### Issue 2: Database connection issues

**Symptoms:**
```
Connection refused by PostgreSQL
Connection timeout
```

**Solution:**
```sql
-- Check PostgreSQL is running
sudo systemctl status postgresql

-- Check database exists
psql -U postgres -d anc -> SELECT 1

-- Check user privileges
psql -U postgres -d anc -c "GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO anc_user;"

# Restart PostgreSQL if needed
sudo systemctl restart postgresql
```

### Issue 3: Push notifications not sending

**Symptoms:**
- FCM device token not registering
- No notifications received by app

**Solution:**
```bash
# Check FCM token
curl -X POST "https://fcm.googleapis.com/v1/projects/your-project-id/messages:send" \
  -H "Authorization: Bearer YOUR_SERVER_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "message": {
      "token": "DEVICE_TOKEN",
      "notification": {
        "title": "Test",
        "body": "Notification test"
      }
    }
  }'

# Check service worker logs
firebase logs:tail --project=your-project-id
```

### Issue 4: SMS messages failing to send

**Symptoms:**
```
Failed to send SMS
Phone number not reachable
```

**Solution:**
```bash
# Verifikasi gateway credentials
curl -X POST "https://api.smsprovider.com/v2/send" \
  -H "Authorization: Bearer YOUR_SMS_KEY" \
  -d "to=6281234567890&text=Test+message"

# Check phone number format
# Indonesia format: 62XXYYYYYYYY
echo "Format: 6281234567890"

# Check gateway balance
curl "https://api.smsprovider.com/v2/status" \
  -H "Authorization: Bearer YOUR_SMS_KEY"
```

---

# 📊 Operational Documentation

## Monitoring & Alerts

### Health Checks

```bash
# API Health
curl http://localhost:3001/health

# Database Health
curl http://localhost:3001/health/db

# Worker Status
curl http://localhost:3001/health/worker

# Cache Health
curl http://localhost:3001/health/cache
```

### Metrics to Monitor

| Metric | Threshold | Action |
|--------|-----------|--------|
| API Response Time | > 2 seconds | Check database queries |
| Error Rate | > 5% | Review logs |
| Queue Depth | > 1000 | Check worker latency |
| Database Connections | > 90% | Increase pool size |
| Memory Usage | > 90% | Scale horizontally |

### Monitoring Tools

```bash
# API Monitoring
pm2 monit
pm2 logs anc-api --lines=100 --nostream

# Database Monitoring
sudo -u postgres psql -d anc -c "SELECT * FROM pg_stat_activity;"

# Worker Monitoring
pm2 log anc-worker --lines=100 --nostream --format json

# System Monitoring
htop
free -m
df -h
```

---

# 🚨 Troubleshooting & Crisis Management

## Emergency Procedures

### Scenario 1: Staff Login failures cascade

**Symptoms:**
- Large number of staff login failures
- Database slow during login operations
- Session management overload

**Procedure:**
```bash
# 1. Pause new staff sessions
sudo iptables -A INPUT -p tcp --dport 3001 -j DROP

# 2. Review login logs
tail -f /var/log/anc-api.log | grep "login\|authentication\|failed"

# 3. Check database performance
psql -U postgres -d anc -c "EXPLAIN ANALYZE SELECT * FROM staff WHERE email = $1;"

# 4. Resume if resolution found
sudo iptables -D INPUT -p tcp --dport 3001 -j DROP
```

### Scenario 2: Mother session rotation issues

**Symptoms:**
- Error "Invalid token" for mothers
- Session not refreshing properly

**Procedure:**
```bash
# 1. Check token rotation status
curl -X POST http://localhost:3001/api/mother-session/refresh \
  -H "Authorization: Bearer $MOTHER_TOKEN"

# 2. Roll back tokens if needed
sudo -u postgres psql -d anc -c "UPDATE mother_sessions SET status = 'invalid' WHERE token_hash = $1;"

# 3. Verify refresh token logic
tail -f /var/log/anc-api.log | grep "refresh\|tokens\|rotation"
```

### Scenario 3: Database migration failures

**Symptoms:**
- Migration fails with constraint violations
- Data corruption detected

**Procedure:**
```bash
# 1. Stop application
pm2 stop anc-api anc-worker

# 2. Rollback migration
npm run db:rollback

# 3. Fix data issues manually
sudo -u postgres psql -d anc -c "UPDATE mother_sessions SET status = 'active' WHERE token_hash = $1;"

# 4. Re-apply migration
npm run db:migrate:prod -- --dry-run
npm run db:migrate:prod
```

---

# ✅ Pre-Deployment Checklist

## Infrastructure
- [ ] PostgreSQL 17 installed and running
- [ ] Redis configured for queue management
- [ ] SSL certificates obtained (from CA)
- [ ] Domain configured and DNS propagated
- [ ] Backup strategy defined and tested
- [ ] Monitoring and alerting system set up
- [ ] Firewall rules configured
- [ ] CI/CD pipeline working and tested
- [ ] Secrets management in place (Vault/other)
- [ ] Disaster recovery plan documented and tested

## Application Configuration
- [ ] Production environment variables set
- [ ] All secrets generated and stored
- [ ] Database schemas migrated
- [ ] API rate limiting configured
- [ ] CORS restrictions implemented
- [ ] Security headers configured
- [ ] Authentication/authorization working
- [ ] Session management configured
- [ ] Logging and monitoring configured
- [ ] Error handling tested
- [ ] Performance optimized

## Tests
- [ ] Unit tests passing
- [ ] Integration tests passing
- [ ] E2E tests passing
- [ ] Smoke tests passing
- [ ] Performance tests passing
- [ ] Security vulnerability scan passed
- [ ] Compliance checks passed
- [ ] User acceptance tests passed

## Documentation
- [ ] API documentation updated
- [ ] Deployment guide followed
- [ ] Troubleshooting guide created
- [ ] User manuals completed
- [ ] Admin guides available
- [ ] Operational procedures documented
- [ ] Crisis management plan documented

## Staff Readiness
- [ ] Key personnel trained on system
- [ ] Admin credentials properly distributed
- [ ] Rollback procedure tested
- [ ] Manual operations procedure documented
- [ ] Emergency contact lists updated
- [ ] On-call rotation established

---

## 📞 Support Contacts

| Role | Contact | Response Time |
|------|---------|---------------|
| On-call Engineer | engineer-oncall@anc.beranda-demo | 15 minutes |
| Tech Lead | techlead@anc.beranda-demo | 1 hour |
| Product Owner | product@anc.beranda-demo | 4 hours |
| Security Team | security@anc.beranda-demo | Immediate |

## 📝 Document Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 2.0.0 | 2026-08-19 | Development Team | Comprehensive security documentation |

---

**This documentation is provided as part of the ANC Reminder System. All rights reserved.**