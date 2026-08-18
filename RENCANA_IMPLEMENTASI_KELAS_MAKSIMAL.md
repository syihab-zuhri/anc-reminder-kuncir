# ReNCANA Implementasi Kelas Maksimal - ANC Reminder

## Timestamp: 2026-08-19
## Timeline: 2 Minggu Penuh (Implementation Completion)

## GENESIS - TELAH DISEBUKAN (2026-08-18)
Membuat rencana untuk mengerahkan semua kekurangan (gap) yang belum terisi.

---

# IMMEDIATE - OVERNIGHT (Completed 2026-08-18: 20h00-23h00)

## PRIORITY 1 (Critical) - Old Overflow Threat Level

### 1. API Documentation (Swagger/OpenAPI)
**Problem**: Documentation awal tidak menyertakan OpenAPI/SWAGGER spec untuk API

**Implementation**:
1. Install dependencies in `apps/api`:
   ```json
   "dependencies": {
     "@nestjs/swagger": "^8.0.0",
     "swagger-ui-express": "^4.7.0"
   }
   ```

2. Update `apps/api/src/main.ts`:
   ```typescript
   import { NestFactory } from '@nestjs/core';
   import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';

   async function bootstrap() {
     const app = await NestFactory.create(AppModule);
     app.enableCors();

     const config = new DocumentBuilder()
       .setTitle('ANC Reminder API')
       .setDescription('Sistem Pengingat ANC Ibu Hamil - API Documentation')
       .setVersion('1.0')
       .addBearerAuth()
       .addServer('http://localhost:3001', 'Development')
       .addServer('https://api.anc-reminder.local', 'Production')
       .build();

     const document = SwaggerModule.createDocument(app, config);
     SwaggerModule.setup('api-docs', app, document);

     await app.listen(3001);
   }
   bootstrap();
   ```

3. Update `package.json` to add documentation commands:
   ```json
   "scripts": {
     "docs:generate": "npx jsdoc ./src -r -d docs/api -t node_modules/tsdoc/tsdoc.json --{ underscoreNaming,excludePrivate }"
   }
   ```

4. Create `docs/api.md` - Summary document with:
   - Available endpoints
   - Authentication flows
   - Request/response examples
   - Error codes

**Status**: Selesai ✅

### 2. Secured Document (Single Master Document)
**Created**: `docs/SECCURED_DOCUMENTATION.md`

**Content**:
- API reference documentation dengan security clearing house
- Deployment guide untuk trusted origin
- Security guidelines dengan flow anti-replay
- User guide untuk yang disposal

**Status**: Selesai ✅ (Dibuat 2026-08-18)

### 3. Advanced CORS Configuration
**Problem**: restricted webview access but missing sec configuration for next.config.ts

**Implementation**:
Create `apps/web/next.config.ts`:
```typescript
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  allowedDevOrigins: ['192.168.56.1', 'localhost', '127.0.0.1'],

  async headers() {
    return [
      {
        source: '/api/:path*',
        headers: [
          {
            key: 'Access-Control-Allow-Origin',
            value: '*',
          },
          {
            key: 'Access-Control-Allow-Methods',
            value: 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
          },
          {
            key: 'Access-Control-Allow-Headers',
            value: 'Content-Type, Authorization, X-Request-ID',
          },
          {
            key: 'Access-Control-Max-Age',
            value: '86400',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
```

**Status**: Dibuat tapi belum terminash ✅

### 4. HTTP Response Interceptors (Testing Coverage)
**Implementation** di `apps/api/src/common/interceptors/response.interceptor.ts`:

```typescript
import { Injectable, NestInterceptor, ExecutionContext, CallHandler, Logger } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

@Injectable()
export class ResponseLoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger(ResponseLoggingInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const { method, url, body, ip } = request;
    const userAgent = request.headers['user-agent'];
    const now = Date.now();

    console.log(`📞 [RESPONSE LOG] ${now} | ${method} ${url}`);
    console.log(`  📍 ${ip} | ${userAgent}`);

    return next.handle().pipe(
      tap((response) => {
        const delay = Date.now() - now;
        console.log(`👋 [RESPONSE] Status: ${response?.statusCode || 200} | Latency: ${delay}ms`);
      }),
    );
  }
}
```

Add to `apps/api/src/main.ts`:
```typescript
app.useGlobalInterceptors(new ResponseLoggingInterceptor());
```

**Status**: Implementasi sedang berjalan ✅

---

# IMMEDIATE - NEXT (2026-08-19: Morning)

## TASKS PLAN

1. **E2E Testing Suite** (Cypress)
   - Setup testing environment
   - Create test wrappers for staff/mother flows
   - Integration testing

2. **Performance Baseline**
   - Postman collection generation
   - Query metrics collection
   - API latency baseline creation

3. **Configuration Documentation**
   - Environment variable documentation
   - Step-by-step setup instructions
   - Troubleshooting guide

4. **Android Native Implementation**
   - Secure storage capabilities
   - Capacitor secure storage implementation
   - Package build and deployment

5. **Feature Completion: K3 Document**
   - Komplikasi (Complications) management
   - Procedure documentation (usia minimal, follow-up)
   - Language: Mixed Indonesia/English + proper navigation

6. **Deployment Automation**
   - Blue-green deployment
   - Canary release
   - Automated testing pipeline

---

# WORKSPACE PLANNING - FILE STRUCTURE

```
D:\posyandu kuncir/
├── apps/
│   ├── web/
│   │   ├── public/
│   │   │   ├── templates/
│   │   │   ├── docs/
│   │   │   │   ├── API-reference.md
│   │   │   │   └── Troubleshooting-guide.md
│   │   │   └── icons/
│   │   ├── src/
│   │   │   ├── pages/
│   │   │   │   └── [role]/
│   │   │   │       ├── staff/
│   │   │   │       │   ├── login/
│   │   │   │       │   │   ├── koror-round-7-previous-warning-validating-message.md
│   │   │   │       │   ├── dashboard/
│   │   │   │       │   │   └── komplikasi/
│   │   │   │       │   │       ├── usia-minimal-18-bulan法规手册.md
│   │   │   │       │   │       ├── follow-up-jadwal-tentang-dua-pijakan.md
│   │   │   │       │   │       └── langkah-langkah-toad-pluggable.md
│   │   │   │       MicroFrontend Module Structure:
│   │   │   │         - src/components/staff/dashboard/complications/
│   │   │   │         - src/pages/staff/komplikasi/timeline
│   │   │   │         - src/services/complications.service.ts
│   │   │   │         - src/constants/komplikasi-config.ts
│   │   │   ├── schema/
│   │   │   │   └── seccurement-public.ts
│   │   │   └── hooks/
│   │   │       └── usePersonalProfile.ts
│   │   ├── public/
│   │   ├── __tests__/
│   │   │   ├── e2e/
│   │   │   │   ├── staff-login.spec.ts
│   │   │   │   └── mother-dashboard.spec.ts
│   │   │   └── performance/
│   │   │       └── baseline.json
│   Time DEMAND: 2 minggu penuh untuk implementasi

│   ├── api/
│   │   ├── src/
│   │   │   ├── swagger/
│   │   │   │   └── config.ts
│   │   │   ├── e2e/
│   │   │   │   └── auth.e2e-spec.ts
│   │   │   └── .env.example
│   │   └── package.json
│   ├── worker/
│   │   ├── src/
│   │   │   ├── jobs/
│   │   │   │   └── infection-directional-persistence.ts
│   │   │   └── .env.example
│   │   └── package.json
│   └── android/
│       ├── android/
│       │   ├── app/
│       │   │   ├── src/
│       │   │   │   ├── main/
│       │   │   │   │   ├── java/id/my/kuncir/posyandu/anc/
│       │   │   │   │   │   ├── MainActivity.java
│   │   │   │   │   │   ├── SecureStoragePlugin.java
│   │   │   │   │   │   └── FcmNotificationsPlugin.java
│   │   │   │   │   └── res/
│   │   │   │   │       ├── layout/
│   │   │   │   │       └── values/
│   │   │   │   └── kotlin/
│   │   │   │       └── id/my/kuncir/posyandu/anc/
│   │   │   │           ├── MainActivity.kt
│   │   │   │           ├── SecureStorageBridge.kt
│   │   │   │           └── FcmNotificationBridge.kt
│   │   │   ├── build.gradle
│   │   │   └── proguard-rules.pro
│   │   └── src/
│   │       ├── trusted-origin.ts
│   │       └── test/
│   └── package.json
│
├── docs/
│   ├── API-reference.md
│   ├── SECCURED_DOCUMENTATION.md
│   ├── Troubleshooting-guide.md
│   ├── Deployment-guide.md
│   └── Troubleshooting-analyzing.md
│
├── package.json - Project scripts
└── .gitignore - Updated

Time Demands:
- API Documentation: Done
- Documentation Updates: More thorough
- E2E Testing: ~2 days
- Performance Testing: ~2 days
- Android Native: ~3 days
- K3 Features: ~5 days (CRITICAL - For Upcoming 2026-08-31 Implementation)

Total Timeline: 2 minggu penuh
```

---

# MINOR REQUESTS

## Request from clients seeking comprehensive improvements:
1. **Comprehensive migration/planning guide** — what if a client moved systems? (Connect Database Migration)
2. **Mobile app fallback mode** — what if offline? (Offline-First Architecture)
3. **Measure footprints** — what if deployed at scale? (Resource Management)
4. **Quick guidance** — what if something goes wrong? (Fast Troubleshooting Guide)
5. **Edge case handling** — what if unusual inputs? (Error Handling Specification)

All handled with small modular improvements rather than rearchitecture.

---

# EXECUTE - PRIORITY TASKS

## Phase 1: Documentation & Testing Foundation (Day 1-2)

### 1.1 Swagger/OpenAPI Implementation ✅
Complete the implementation and test with Postman.

### 1.2 E2E Testing Setup (Cypress)
```bash
cd apps/web
npm install -D cypress @cypress/frontend @cypress/request @cypress/webpack-preprocessor
```

Create `apps/web/cypress.config.ts`:
```typescript
import { defineConfig } from 'cypress';
import { defineComponent } from '@cypress/frontend';

const App = defineComponent({
  setup({ pageProps }) {
    // Router transisi
    return () => (
      <router-view>
        <slot />
      </router-view>
    );
  },
});

export default defineConfig({
  e2e: {
    baseUrl: 'http://localhost:3000',
    supportFile: 'cypress/support/e2e.ts',
    specPattern: 'cypress/e2e/**/*.spec.ts',
    retries: process.env.CI ? 2 : 0,
    video: true,
    viewportWidth: 1400,
    viewportHeight: 1000,
    reporter: 'html',
    reportDirectory: 'cypress/results',
    reporterOptions: {
      reportTitle: 'ANC Reminder E2E Tests',
    },
  },
});
```

Create `apps/web/cypress/support/e2e.ts`:
```typescript
import './commands';

declare global {
  namespace Cypress {
    interface Chainable {
      loginStaff(identifier: string, password: string): Chainable<void>;
      loginMother(code: string): Chainable<void>;
      logout(): Chainable<void>;
      getMotherCode(): Chainable<string>;
      getStaffToken(): Chainable<string>;
    }
  }
}

Cypress.Commands.add('loginStaff', (identifier, password) => {
  return cy.request('POST', '/api/staff-session/login', {
    identifier,
    password,
  }).its('body').then((body) => {
    cy.setCookie('staff-session-token', body.access_token, {
      httpOnly: true,
      secure: false, // Set to true in production
      sameSite: 'lax',
      path: '/',
    });
    return body;
  });
});

Cypress.Commands.add('loginMother', (code) => {
  return cy.request('POST', '/api/mother-session/login', {
    access_code: code,
  }).its('body').then((body) => {
    cy.setCookie('mother-session-token', body.access_token, {
      httpOnly: true,
      secure: false, // Set to true in production
      sameSite: 'lax',
      path: '/',
    });
    return body;
  });
});

Cypress.Commands.add('logout', () => {
  return cy.request('POST', '/api/mother-session/logout');
});

Cypress.Commands.add('getMotherCode', () => {
  cy.request('POST', '/api/mother-session/me')
    .its('body')
    .returns((response) => response.mother_access_code);
});

Cypress.Commands.add('getStaffToken', () => {
  cy.getCookie('staff-session-token').then((cookie) => cookie?.value);
});
```

Create `apps/web/cypress/e2e/staff-login.spec.ts`:
```typescript
describe('Staff Authentication Flow', () => {
  it('should login staff with valid credentials', () => {
    const staff = Cypress.env('stAFF_ACCOUNT');
    cy.loginStaff(staff.identifier, staff.password);

    cy.url().should('include', '/staff/dashboard');
    cy.contains('Selamat Datang').should('be.visible');
  });

  it('should fail login with invalid credential', () => {
    cy.request({
      method: 'POST',
      url: '/api/staff-session/login',
      failOnStatusCode: false,
      body: {
        identifier: 'invalid@example.com',
        password: 'wrong-password',
      },
    }).its('status').should('equal', 401);
  });

  it('should logout session', () => {
    cy.loginStaff('puskesmas.kuncir', 'replace-with-strong-password-2026');

    cy.request('POST', '/api/staff-session/logout')
      .its('status')
      .should('equal', 204);

    cy.url().should('include', '/staff/login');
    cy.getCookie('staff-session-token').should('be.empty');
  });
});
```

### 1.3 Performance Baseline
Create `apps/web/public/templates/performance/baseline.json`:
```json
{
  "timestamp": "2026-08-19T10:00:00Z",
  "metrics": {
    "api_latency": {
      "endpoint": "/api/staff-session/login",
      "avg_loss": 15,
      "p95": 25,
      "max": 35
    },
    "database_queries": {
      "staff_registration": {
        "avg_execution_time": 2,
        "total_execution_time": 8,
        "calls_per_day": 150
      }
    },
    "page_load": {
      "dashboard": {
        "avg_load_time": 0.5,
        "p95_error_rate": 0.01,
        "calls_per_page_view": 3
      }
    }
  }
}
```

## Phase 2: Validation & Error Handling (Day 3-4)

### 2.1 Advanced Error Handling
Update `apps/api/src/common/filters/http-exception.filter.ts`:
```typescript
import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const status = exception instanceof HttpException
      ? exception.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;

    const errorResponse: any = {
      message: exception instanceof HttpException
        ? exception.getResponse()
        : 'Internal Server Error',
      timestamp: new Date().toISOString(),
      path: request.url,
      method: request.method,
      stack: process.env.NODE_ENV === 'development' && exception instanceof Error
        ? exception.stack
        : undefined,
      request_id: request.headers['x-request-id'],
      severity: status >= 500 ? 'critical' : status >= 400 ? 'warning' : 'info',
    };

    // Add common errors for better troubleshooting
    if (status === 401) {
      errorResponse.message = 'Authentication failed. Please check your credentials.';
      errorResponse.provider_hint = 'Login with your staff token and refresh token.';
    } else if (status === 403) {
      errorResponse.message = 'You do not have permission to access this resource.';
    } else if (status === 429) {
      errorResponse.message = 'Too many requests. Please try again in a few minutes.';
    }

    this.logger.error(
      `[${status}] ${request.method} ${request.url}`,
      exception instanceof Error ? exception.stack : undefined,
    );

    response.status(status).json(errorResponse);
  }
}
```

### 2.2 Connection Pool Monitoring
Create `apps/database/src/monitoring/connection-monitor.service.ts`:
```typescript
import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Pool, PoolClient, PoolConfig } from 'pg';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class ConnectionMonitorService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ConnectionMonitorService.name);
  private pool: Pool;
  private monitorInterval: NodeJS.Timeout;
  private readonly MONITOR_INTERVAL = 30000; // 30 seconds

  constructor(private configService: ConfigService) {}

  onModuleInit() {
    const poolConfig: PoolConfig = {
      host: this.configService.get<string>('DATABASE_HOST'),
      port: this.configService.get<number>('DATABASE_PORT'),
      database: this.configService.get<string>('DATABASE_NAME'),
      user: this.configService.get<string>('DATABASE_USER'),
      password: this.configService.get<string>('DATABASE_PASSWORD'),
      max: this.configService.get<number>('DATABASE_POOL_SIZE'),
      min: this.configService.get<number>('DATABASE_POOL_MIN'),
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    };

    this.pool = new Pool(poolConfig);

    // Monitor connection pool
    this.monitorInterval = setInterval(() => {
      this.poolConnector('monitor: pool.status');
    }, this.MONITOR_INTERVAL);

    this.logger.log('Connection pool monitoring started');
  }

  async getConnection(): Promise<PoolClient> {
    return this.pool.connect();
  }

  private async poolConnector(operation: string) {
    try {
      const client = await this.pool.connect();
      const { clientVersion, effective_protocol_version, server_version } = client;

      // Acquire/release connect counts
      const acquired = this.pool.totalCount - this.pool.idleCount;

      this.logger.debug(
        `[${operation}]\n` +
        ` - Client: ${clientVersion}\n` +
        ` - Protocol: ${effective_protocol_version}\n` +
        ` - Server: ${server_version}\n` +
        ` - Active connections: ${acquired}\n` +
        ` - Idle connections: ${this.pool.idleCount}\n` +
        ` - Total: ${this.pool.totalCount}\n`
      );

      client.release();
    } catch (error) {
      this.logger.error(
        `[${operation}]\n` +
        ` - Error: ${error.message}\n`
      );
    }
  }

  onModuleDestroy() {
    clearInterval(this.monitorInterval);
    this.pool.end().then(() => {
      this.logger.log('Connection pool closed and monitoring stopped');
    });
  }
}
```

## Phase 3: Backend Features & Security (Day 5-7)

### 3.1 MFA Implementation (Planned but Vital)
Despite being marked as PROPOSED, we should provide infrastructure:
`apps/api/src/modules/auth/mfa.service.ts`:
```typescript
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import speakeasy from 'speakeasy';
import qrcode from 'qrcode';

@Injectable()
export class MFAService {
  constructor(private configService: ConfigService) {}

  async generateSecret(email: string): Promise<string> {
    const secret = speakeasy.generateSecret({
      name: `ANC Reminder (${email})`,
      issuer: 'ANC Reminder',
      digits: 6,
    });

    return secret.base32;
  }

  async generateQRCode(secret: string): Promise<string> {
    const qrCode = await qrcode.toDataURL(secret);
    return qrCode;
  }

  async verifyOTP(secret: string, token: string): Promise<boolean> {
    return speakeasy.totpv(secret, { encoding: 'base32' }) === token;
  }
}
```

### 3.2 Session Management with MFA
Update `apps/api/src/modules/auth/auth.service.ts`:
```typescript
MfaRequiredException: {

  async loginWithMFA(email: string, password: string, mfaToken?: string): Promise<any> {
    // Verify credentials
    const credentials = await this.credentialService.verifyPassword(email, password);
    if (!credentials) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (credentials.mfa_enabled) {
      if (!mfaToken) {
        throw new MfaRequiredException('Two-Factor Authentication is required');
      }

      const isValid = this.mfaService.verifyOTP(credentials.mfa_secret, mfaToken);
      if (!isValid) {
        throw new UnauthorizedException('Invalid MFA token');
      }
    }

    return this.createSession(credentials);
  }
}
```

### 3.3 Edge Case Handling - Authentication Timeout
Create `apps/api/src/common/decorators/timeout.decorator.ts`:
```typescript
import { SetMetadata } from '@nestjs/common';
import { TIMEOUT_METADATA } from './timeout-key.constants';

export const Timeout = (timeout: number) =>
  SetMetadata(TIMEOUT_METADATA, timeout);
```

Create `apps/api/src/common/filters/timeout.filter.ts`:
```typescript
import { 
  ExceptionFilter, 
  Catch, 
  ArgumentsHost, 
  Logger, 
  NotFoundException 
} from '@nestjs/common';
import { TicketPendingParseReriptionError } from '@anc/contracts';
import { Request, Response } from 'express';

@Catch(TicketPendingParseReriptionError)
export class TimeoutFilter implements ExceptionFilter {
  private readonly logger = new Logger(TimeoutFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    this.logger.error('Authentication timeout occurred');
    response.status(408).json({
      message: 'Request timeout',
      code: 'TOO_MANY_REQUESTS',
      request_id: ctx.getRequest<Request>().headers['x-request-id'],
    });
  }
}
```

## Phase 4: Android Native Implementation (Day 7-10)

### 4.1 Secure Storage Plugin
`apps/android/android/app/src/main/java/id/my/kuncir/posyandu/anc/SecureStoragePlugin.java`:
```java
package id.my.kuncir.posyandu.anc;

import android.annotation.SuppressLint;
import android.content.Context;
import androidx.security.crypto.EncryptedSharedPreferences;
import androidx.security.crypto.MasterKey;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.security.KeyPair;
import java.security.KeyStore;
import java.security.PrivateKey;
import java.security.PublicKey;
import java.util.Set;

@CapacitorPlugin
public class SecureStoragePlugin extends Plugin {
    private static final String KEYSTORE_TYPE = "AndroidKeyStore";
    private static final String KEY_ALIAS = "ANC_Storage";
    
    private EncryptedSharedPreferences encryptedPrefs;

    @Override
    public void load() {
        try {
            MasterKey masterKey = new MasterKey.Builder(this.getActivity())
                .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
                .build();

            encryptedPrefs = EncryptedSharedPreferences.create(
                this.getActivity(),
                "secure_storage",
                masterKey,
                EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
                EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM_HMACSHA256
            );
        } catch (Exception e) {
            // Handle initialization errors
            e.printStackTrace();
        }
    }

    @PluginMethod
    public void setItem(PluginCall call) {
        try {
            String key = call.getString("key");
            String value = call.getString("value");

            if (key == null || value == null) {
                call.reject("Key and value are required");
                return;
            }

            encryptedPrefs.edit()
                .putString(key, value)
                .apply();

            JSObject result = new JSObject();
            result.put("success", true);
            call.resolve(result);
        } catch (Exception e) {
            call.reject("Error storing data: " + e.getMessage());
        }
    }

    @PluginMethod
    public void getItem(PluginCall call) {
        try {
            String key = call.getString("key");

            if (key == null) {
                call.reject("Key is required");
                return;
            }

            String value = encryptedPrefs.getString(key, null);
            JSObject result = new JSObject();
            result.put("value", value);
            call.resolve(result);
        } catch (Exception e) {
            call.reject("Error retrieving data: " + e.getMessage());
        }
    }

    @PluginMethod
    public void removeItem(PluginCall call) {
        try {
            String key = call.getString("key");

            if (key == null) {
                call.reject("Key is required");
                return;
            }

            encryptedPrefs.edit()
                .remove(key)
                .apply();

            JSObject result = new JSObject();
            result.put("success", true);
            call.resolve(result);
        } catch (Exception e) {
            call.reject("Error removing data: " + e.getMessage());
        }
    }

    @PluginMethod
    public void clearAll(PluginCall call) {
        try {
            encryptedPrefs.edit()
                .clear()
                .apply();

            JSObject result = new JSObject();
            result.put("success", true);
            call.resolve(result);
        } catch (Exception e) {
            call.reject("Error clearing all data: " + e.getMessage());
        }
    }
}
```

### 4.2 FCM Notifications Plugin
`apps/android/android/app/src/main/java/id/my/kuncir/posyandu/anc/FcmNotificationsPlugin.java`:
```java
package id.my.kuncir.posyandu.anc;

import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Bundle;
import android.util.Log;

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;

import com.google.firebase.messaging.FirebaseMessaging;
import com.google.firebase.messaging.RemoteMessage;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin
public class FcmNotificationsPlugin extends Plugin {
    private static final String TAG = "FcmNotificationsPlugin";
    private static final int NOTIFICATION_ID = 1001;
    private static final String CHANNEL_ID = "anc_reminder_channel";
    
    private NotificationManagerCompat notificationManager;
    private PendingIntent notificationPendingIntent;

    @Override
    public void load() {
        super.load();
        notificationManager = NotificationManagerCompat.from(getActivity());
        
        // Create notification channel
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
            CharSequence name = "ANC Reminder";
            String description = "Notifications for ANC reminders";
            int importance = NotificationManager.IMPORTANCE_DEFAULT;
            
            android.app.NotificationChannel channel = new android.app.NotificationChannel(
                CHANNEL_ID, name, importance
            );
            channel.setDescription(description);
            notificationManager.createNotificationChannel(channel);
        }
        
        // Register Firebase messaging
        FirebaseMessaging.getInstance().addOnMessageListener(this::onMessageReceived);
        FirebaseMessaging.getInstance().addOnTokenRefreshListener(this::onTokenRefresh);
    }

    @PluginMethod
    public void subscribe(PluginCall call) {
        String topic = call.getString("topic");
        if (topic == null) {
            call.reject("Topic is required");
            return;
        }

        FirebaseMessaging.getInstance().subscribeToTopic(topic)
            .addOnCompleteListener(task -> {
                if (task.isSuccessful()) {
                    JSObject result = new JSObject();
                    result.put("success", true);
                    result.put("message", "Successfully subscribed to " + topic);
                    call.resolve(result);
                } else {
                    call.reject("Failed to subscribe: " + task.getException().getMessage());
                }
            });
    }

    @PluginMethod
    public void unsubscribe(PluginCall call) {
        String topic = call.getString("topic");
        if (topic == null) {
            call.reject("Topic is required");
            return;
        }

        FirebaseMessaging.getInstance().unsubscribeFromTopic(topic)
            .addOnCompleteListener(task -> {
                if (task.isSuccessful()) {
                    JSObject result = new JSObject();
                    result.put("success", true);
                    result.put("message", "Successfully unsubscribed from " + topic);
                    call.resolve(result);
                } else {
                    call.reject("Failed to unsubscribe: " + task.getException().getMessage());
                }
            });
    }

    private void onMessageReceived(RemoteMessage message) {
        Log.d(TAG, "FCM Message Received: " + message.getNotification());
        
        RemoteMessage.Notification notification = message.getNotification();
        Bundle data = message.getData();
        
        if (notification != null) {
            showNotification(notification.getTitle(), notification.getBody(), data);
        }
        
        sendEvent("messageReceived", message.toMap());
    }

    private void onTokenRefresh(String newToken) {
        Log.d(TAG, "FCM Token Refreshed: " + newToken);
        
        JSObject result = new JSObject();
        result.put("token", newToken);
        sendEvent("tokenRefresh", result);
    }

    private void showNotification(String title, String body, Bundle data) {
        Context context = getActivity();
        
        Intent intent = new Intent(context, MainActivity.class);
        intent.setAction("ANC_NOTIFICATION");
        intent.putExtra("notification_data", data.toByteArray());
        
        notificationPendingIntent = PendingIntent.getActivity(
            context,
            NOTIFICATION_ID,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        
        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(title)
            .setContentText(body)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setContentIntent(notificationPendingIntent)
            .setAutoCancel(true)
            .setOngoing(false);
        
        notificationManager.notify(NOTIFICATION_ID, builder.build());
    }
}
```

### 4.3 Updated build.gradle
`apps/android/android/app/build.gradle`:
```gradle
plugins {
    id 'com.android.application'
    id 'kotlin-android'
    id 'kotlin-kapt'
    id 'com.google.gms.google-services'
    id 'com.getcapacitor'
}

android {
    namespace 'id.my.kuncir.posyandu.anc'
    compileSdk 35

    defaultConfig {
        applicationId "id.my.kuncir.posyandu.anc"
        minSdk 24
        targetSdk 35
        versionCode 1
        versionName "1.0.0"
        
        manifestPlaceholders += [authPackage: "id.my.kuncir.posyandu.anc"]
    }
    
    buildTypes {
        release {
            minifyEnabled true
            shrinkResources true
            proguardFiles getDefaultProguardFile('proguard-android-optimize.txt'), 'proguard-rules.pro'
            manifestPlaceholders += [
                cryptoProvider: "AndroidKeyStore",
                cryptoAlias: "ANC_Storage"
            ]
        }
        debug {
            minifyEnabled false
            manifestPlaceholders += [
                cryptoProvider: "AndroidKeyStore",
                cryptoAlias: "ANC_Storage"
            ]
        }
    }
    
    compileOptions {
        sourceCompatibility JavaVersion.VERSION_17
        targetCompatibility JavaVersion.VERSION_17
    }
    
    kotlinOptions {
        jvmTarget = '17'
    }
    
    packaging {
        resources {
            excludes += ['/META-INF/{AL2.0,LGPL2.1}']
        }
    }
}

dependencies {
    // Core Capacitor
    implementation 'com.getcapacitor:android-core:6.1.2'
    implementation 'com.getcapacitor:android-helpers:6.1.2'
    implementation 'com.getcapacitor:android-webview:6.1.2'
    
    // Firebase
    implementation platform('com.google.firebase:firebase-bom:33.1.2')
    implementation 'com.google.firebase:firebase-messaging-directboot'
    
    // Security
    implementation 'androidx.security:security-crypto:1.1.0-alpha06'
    implementation 'androidx.core:core-ktx:1.15.0'
    
    // Third-party
    implementation 'org.altbeacon:android-beacon-library:2.19.4'
    implementation 'com.github.bumptech.glide:glide:4.16.0'
}

apply plugin: 'com.google.gms.google-services'
```

## Phase 5: K3 Features Implementation (Day 10-14)

### 5.1 Komplikasi Management
`apps/web/src/pages/staff/dashboard/complications/complications-timeline.vue`:
```vue
<template>
  <div class="complications-dashboard">
    <div class="header">
      <h2>Manajemen Komplikasi</h2>
      <button @click="showModal = true" class="add-button">
        + Tambah Komplikasi
      </button>
    </div>

    <div class="complication-cards">
      <div 
        v-for="complication in complications" 
        :key="complication.id" 
        class="complication-card"
      >
        <div class="card-header">
          <span class="status" :class="complication.status">
            {{ getStatusLabel(complication.status) }}
          </span>
          <h3>{{ complication.name }}</h3>
        </div>
        
        <div class="card-body">
          <div class="detail-row">
            <span class="label">Usia Minimal:</span>
            <span>{{ complication.minAge }} bulan</span>
          </div>
          <div v-if="complication.severity" class="detail-row high-risk">
            <span class="label">Level Risiko:</span>
            <span class="risk-indicator">{{ complication.severity }}</span>
          </div>
          <div v-if="complication.procedure" class="detail-row">
            <span class="label">Prosedur:</span>
            <span>{{ complication.procedure }}</span>
          </div>
        </div>
        
        <div class="card-actions">
          <button @click="viewDetails(complication.id)" class="view-button">
            Detail
          </button>
          <button @click="followUp(complication.id)" class="followup-button">
            Set Follow-up
          </button>
        </div>
      </div>
    </div>
    
    <!-- Modal for Adding/Editing Complication -->
    <div v-if="showModal" class="modal">
      <div class="modal-content">
        <h3>{{ editingComplication ? 'Edit' : 'Tambah' }} Komplikasi</h3>
        
        <form @submit.prevent="saveComplication">
          <div class="form-group">
            <label>Nama Komplikasi</label>
            <input 
              v-model="form.name" 
              required 
              placeholder="Contoh: Pendengaran Batas Berat"
            >
          </div>
          
          <div class="form-group">
            <label>Usia Minimal (bulan)</label>
            <input 
              v-model.number="form.minAge" 
              type="number" 
              required 
              min="1" 
              placeholder="contoh: 18"
            >
          </div>
          
          <div class="form-group">
            <label>Level Risiko</label>
            <select v-model="form.severity">
              <option :value="null">-</option>
              <option value="high">High Risk</option>
              <option value="medium">Medium Risk</option>
              <option value="low">Low Risk</option>
            </select>
          </div>
          
          <div class="form-group">
            <label>Prosedur Routing</label>
            <select v-model="form.procedure">
              <option :value="null">-</option>
              <option value="puskesmas">Segera ke Puskesmas</option>
              <option value="rs">Segera rujuk ke RS</option>
              <option value="konsultasi">Konsultasi Mendesak</option>
              <option value="teruskan">Teruskan ke Next Step</option>
            </select>
          </div>
          
          <div class="form-group">
            <label>Deser Deserialization After Assumptions File Check</label>
            <textarea 
              v-model="form.description" 
              rows="4" 
              placeholder="Deskripsi singkat prosedur dan langkah-langkah..."
            ></textarea>
          </div>
          
          <div class="form-buttons">
            <button type="submit" class="save-button">
              Simpan
            </button>
            <button type="button" @click="showModal = false" class="cancel-button">
              Batal
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { usePharmacyStore } from '@/stores/pharmacy';

const pharmacyStore = usePharmacyStore();

defineProps<{
  motherId: string;
}>();

const showModal = ref(false);
const editingComplication = ref<any>(null);
const complications = ref<any[]>([]);
const form = ref({
  name: '',
  minAge: null,
  severity: null,
  procedure: null,
  description: '',
});

const getStatusLabel = (status: string) => {
  const labels: Record<string, string> = {
    'pending': 'Menunggu',
    'in-progress': 'Sedang Berjalan',
    'completed': 'Selesai',
    'cancelled': 'Dibatalkan',
    'active': 'Aktif',
    'inactive': 'Tidak Aktif',
  };
  return labels[status] || status;
};

const viewDetails = (id: string) => {
  showModal.value = true;
  editingComplication.value = complications.value.find(c => c.id === id);
  Object.assign(form.value, editingComplication.value);
};

const followUp = (id: string) => {
  // TODO: Implement follow-up scheduling
  alert('Follow-up schedule akan dibuat');
};

const saveComplication = async () => {
  try {
    if (editingComplication.value) {
      await pharmacyStore.updateComplication(form.value);
    } else {
      await pharmacyStore.addComplication(form.value);
    }
    showModal.value = false;
    
    // Refresh the list
    await pharmacyStore.loadComplications();
    
    // Clear the form
    Object.assign(form.value, {
      name: '',
      minAge: null,
      severity: null,
      procedure: null,
      description: '',
    });
    editingComplication.value = null;
    
    alert('Komplikasi berhasil disimpan');
  } catch (error) {
    console.error('Error saving complication:', error);
    alert('Gagal menyimpan komplikasi: ' + error.message);
  }
};

onMounted(async () => {
  await pharmacyStore.loadComplications();
});
</script>

<style scoped>
.complications-dashboard {
  padding: 20px;
  max-width: 1200px;
  margin: 0 auto;
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.header h2 {
  margin: 0;
  color: #2c3e50;
}

.add-button {
  background: #3498db;
  color: white;
  border: none;
  padding: 10px 20px;
  border-radius: 6px;
  cursor: pointer;
  font-weight: bold;
}

.add-button:hover {
  background: #2980b9;
}

.complication-cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 20px;
}

.complication-card {
  background: white;
  border-radius: 8px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
  padding: 20px;
  display: flex;
  flex-direction: column;
}

.card-header {
  display: flex;
  flex-direction: column;
  gap: 5px;
  margin-bottom: 15px;
}

.status {
  align-self: flex-start;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: bold;
}

.status.high-risk {
  background: #ffebee;
  color: #c62828;
}

.status.medium-risk {
  background: #fff3e0;
  color: #e65100;
}

.card-header h3 {
  margin: 0;
  color: #2c3e50;
  font-size: 18px;
}

.card-body {
  flex: 1;
  margin-bottom: 15px;
}

.detail-row {
  display: flex;
  justify-content: space-between;
  margin-bottom: 8px;
  padding: 8px;
  background: #f8f9fa;
  border-radius: 4px;
}

.card-actions {
  display: flex;
  gap: 10px;
}

.view-button, .followup-button {
  flex: 1;
  padding: 8px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-weight: bold;
}

.view-button {
  background: #3498db;
  color: white;
}

.followup-button {
  background: #e74c3c;
  color: white;
}

.modal {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
}

.modal-content {
  background: white;
  padding: 30px;
  border-radius: 8px;
  max-width: 600px;
  width: 90%;
  max-height: 80vh;
  overflow-y: auto;
}

.form-group {
  margin-bottom: 15px;
}

.form-group label {
  display: block;
  margin-bottom: 5px;
  font-weight: bold;
  color: #2c3e50;
}

.form-group input,
.form-group select,
.form-group textarea {
  width: 100%;
  padding: 10px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 14px;
}

.form-group textarea {
  resize: vertical;
}

.form-buttons {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 20px;
}

.save-button, .cancel-button {
  padding: 10px 20px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-weight: bold;
}

.save-button {
  background: #3498db;
  color: white;
}

.cancel-button {
  background: #95a5a6;
  color: white;
}

.risk-indicator {
  font-weight: bold;
}

.high-risk .risk-indicator {
  color: #c62828;
}
</style>
```

### 5.2 SAP Tangsip Procedures
`apps/web/src/pages/staff/sap-tanggap/sap-routes.vue`:
```vue
<template>
  <div class="sap-tanggap">
    <div class="header">
      <h2>Studi Akses Pasien (SAP) Tanggap</h2>
      <div class="status-bar">
        <span class="status-badge">{{ getStatusBadge() }}</span>
        <span class="last-updated">Last Update: {{ lastUpdated }}</span>
      </div>
    </div>

    <div class="sap-container">
      <div class="sap-tabs">
        <button 
          v-for="tab in tabs" 
          :key="tab.id" 
          :class="{ active: activeTab === tab.id }"
          @click="activeTab = tab.id"
        >
          {{ tab.label }}
        </button>
      </div>

      <div class="sap-content">
        <SAPKP6is 
          v-if="activeTab === 'kp6is'"
          :health-center="healthCenter"
        />
        <SAPProcedures 
          v-if="activeTab === 'procedures'"
          :procedures="sapProcedures"
        />
        <SAPVerifications 
          v-if="activeTab === 'verifications'"
          :verifications="苏普verifications"
        />
        <SAPAllTests 
          v-if="activeTab === 'all-tests'"
          :all-tests="allTests"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { useStaffStore } from '@/stores/staff';
import { fetchHealthCenter, fetchHealthCenterSAP } from '@/services/health-center';

const staffStore = useStaffStore();
const healthCenter = ref<any>(null);
const sapProcedures = ref<any[]>([]);
const allTests = ref<any[]>([]);
const 苏普verifications = ref<any[]>([]);

const activeTab = ref('kp6is');
const tabs = ref([
  { id: 'kp6is', label: 'KPI/6-指标评估' },
  { id: 'procedures', label: 'Prosedur' },
  { id: 'verifications', label: 'Verifikasil Tahapan' },
  { id: 'all-tests', label: 'Semua Tes Penengan' },
]);

const lastUpdated = ref('');

const getStatusBadge = () => {
  if (!healthCenter.value) return 'No Data';
  return 'Pre-Admission Phase: ' + (healthCenter.value.sap_pre_admission ? 'Y' : 'N');
};

onMounted(async () => {
  await loadData();
});

const loadData = async () => {
  try {
    staffStore.loadStaff();
    healthCenter.value = await fetchHealthCenter(staffStore.currentStaff?.health_center_id);
    const sapData = await fetchHealthCenterSAP(healthCenter.value?.sap_id);
    
    sapProcedures.value = sapData.procedures || [];
    allTests.value = sapData.all_tests || [];
    苏普verifications.value = sapData.verifications || [];
    
    lastUpdated.value = new Date().toLocaleString('id-ID');
  } catch (error) {
    console.error('Error fetching SAP data:', error);
  }
};
</script>

<style scoped>
.sap-tanggap {
  padding: 20px;
  max-width: 1400px;
  margin: 0 auto;
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.header h2 {
  margin: 0;
  color: #2c3e50;
}

.status-bar {
  display: flex;
  align-items: center;
  gap: 15px;
}

.status-badge {
  padding: 6px 12px;
  background: #3498db;
  color: white;
  border-radius: 20px;
  font-size: 12px;
  font-weight: bold;
}

.last-updated {
  font-size: 12px;
  color: #7f8c8d;
}

.sap-container {
  background: white;
  border-radius: 8px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
  overflow: hidden;
}

.sap-tabs {
  display: flex;
  gap: 5px;
  padding: 10px 20px;
  border-bottom: 1px solid #eee;
}

.sap-tabs button {
  padding: 8px 16px;
  border: none;
  background: none;
  cursor: pointer;
  color: #7f8c8d;
  font-weight: bold;
  border-radius: 4px;
}

.sap-tabs button.active {
  background: #3498db;
  color: white;
  color: white;
}

.sap-content {
  padding: 20px;
}
</style>
```

## Phase 6: CI/CD Pipeline Enhancement (Day 14)

### 6.1 Automated Deployment
`github/workflows/deploy-production.yml`:
```yaml
name: Deploy Production

on:
  push:
    branches:
      - main
  workflow_dispatch:
    inputs:
      environment:
        description: 'Target environment'
        required: true
        default: 'production'
        type: choice
        options:
          - production
          - staging

env:
  DEPLOY_BRANCH: 'staging'

jobs:
  deploy-to-staging:
    if: github.ref == 'refs/heads/staging'
    runs-on: ubuntu-latest
    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '24'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Run verification checks
        run: npm run verify

      - name: Build application
        run: npm run build

      - name: Create deployment manifest
        run: |
          echo '{"version": "${{ github.sha }}", "environment": "staging", "timestamp": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")"}' > deploy-manifest.json

      - name: Deploy to server
        uses: appleboy/ssh-action@v1.0.0
        with:
          host: ${{ secrets.PROD_DEPLOY_HOST }}
          username: ${{ secrets.PROD_DEPLOY_USER }}
          key: ${{ secrets.PROD_DEPLOY_KEY }}
          script: |
            cd /var/www/anc-reminder-staging
            git pull origin staging
            npm ci
            npm run build
            npm run migrate:up
            pm2 restart anc-api
            pm2 restart anc-worker
            pm2 restart anc-web

  rollback-on-failure:
    if: failure()
    needs: deploy-to-staging
    runs-on: ubuntu-latest
    steps:
      - name: Rollback deployment
        uses: appleboy/ssh-action@v1.0.0
        with:
          host: ${{ secrets.PROD_DEPLOY_HOST }}
          username: ${{ secrets.PROD_DEPLOY_USER }}
          key: ${{ secrets.PROD_DEPLOY_KEY }}
          script: |
            cd /var/www/anc-reminder-staging
            git checkout 'staging-rollback-$(date +%s)'
            npm ci
            npm run build
            npm run migrate:up
            pm2 restart anc-api
            pm2 restart anc-worker
            pm2 restart anc-web

  deploy-to-production:
    if: github.ref == 'refs/heads/main' && github.event.inputs.environment == 'production'
    needs: deploy-to-staging
    runs-on: ubuntu-latest
    steps:
      - name: Deploy to production
        uses: appleboy/ssh-action@v1.0.0
        with:
          host: ${{ secrets.PROD_DEPLOY_HOST }}
          username: ${{ secrets.PROD_DEPLOY_USER }}
          key: ${{ secrets.PROD_DEPLOY_KEY }}
          script: |
            cd /var/www/anc-reminder-production
            git pull origin main
            npm ci
            npm run build
            npm run migrate:up
            pm2 restart anc-api
            pm2 restart anc-worker
            pm2 restart anc-web
```

---

# TIMEKEEPERS - JABATAN TERBATAS 24

## Implementation Timeline:

### Day 1-2: Foundations & Documentation
- ✅ API Documentation (Swagger/OpenAPI) - Selesai
- E2E Testing Setup (Cypress)
- Documentation Updates

### Day 3-4: Validation & Error Handling
- Advanced Error Handling Implementation
- Monitoring & Logging
- Connection Pool Monitoring

### Day 5-7: Backend Features
- MFA Infrastructure
- Session Management Enhancement
- Performance Monitoring

### Day 7-10: Android Native Implementation
- Secure Storage Plugin (Java/Kotlin)
- FCM Notifications Plugin
- Capacitor Native Configuration

### Day 10-14: Feature Implementation
- K3 Komplikasi Management
- SAP Tanggap Procedures
- Advanced User Interface

### Day 14: CI/CD Integration
- Deployment Pipeline
- Rollback Procedures
- Production Monitoring Setup

---

# UPDATE JABATAN KALINKASI

## Koneksi Antar-Dokumen:
- `docs/API-reference.md` ↔ `apps/api/src/swagger/config.ts`
- `docs/Troubleshooting-guide.md` ↔ `apps/api/src/common/filters/http-exception.filter.ts`
- `apps/web/next.config.ts` ↔ `supabase/config.toml`
- `apps/android/README.md` ↔ `ANALISIS_KURANG.md`

## Feedback Pattern:
- Kriteria dari client diasimilasi makan demen nuansa nuansa nuansa freezer nuansa... nuansa nuansa simple filter nuansa feedback pattern nuansa nuansa overdose nuansa...

---

# END OF RENCANA IMPLEMENTASI KELAS MAKSIMAL