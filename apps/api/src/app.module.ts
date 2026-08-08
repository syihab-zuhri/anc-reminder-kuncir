import { Module, type DynamicModule } from "@nestjs/common";
import type { ApiConfig } from "@anc/config";
import { checkDatabaseReadiness, closeDatabasePool, type DatabasePool } from "@anc/database";
import { HealthController } from "./health/health.controller.js";
import { HealthService, type DatabaseReadinessCheck } from "./health/health.service.js";
import {
  DatabaseLifecycleService,
  type DatabasePoolClose,
} from "./infrastructure/database-lifecycle.service.js";
import {
  AUDIT_REPOSITORY,
  AUDIT_SERVICE,
  API_CONFIG,
  CLOCK,
  DATABASE_POOL,
  DATABASE_POOL_CLOSE,
  DATABASE_READINESS_CHECK,
  ORGANIZATION_SCOPE_REPOSITORY,
  SCOPED_ACCESS_REPOSITORY,
  SESSION_TOKEN_SERVICE,
  STAFF_AUTH_REPOSITORY,
} from "./infrastructure/tokens.js";
import { StaffAuthController } from "./auth/staff-auth.controller.js";
import { StaffAuthGuard } from "./auth/staff-auth.guard.js";
import {
  PostgresStaffAuthRepository,
  type StaffAuthRepository,
} from "./auth/staff-auth.repository.js";
import { StaffAuthService, type Clock } from "./auth/staff-auth.service.js";
import { PasswordHasher } from "./auth/password-hasher.js";
import { SessionTokenService } from "./auth/session-token.service.js";
import { AuditService } from "./audit/audit.service.js";
import { PostgresAuditRepository, type AuditRepository } from "./audit/audit.repository.js";
import { AuthorizationPolicy } from "./authorization/authorization.policy.js";
import {
  PostgresScopedAccessRepository,
  type ScopedAccessRepository,
} from "./authorization/scoped-access.repository.js";
import { ScopedAccessService } from "./authorization/scoped-access.service.js";
import { OrganizationScopeController } from "./organization/organization-scope.controller.js";
import {
  PostgresOrganizationScopeRepository,
  type OrganizationScopeRepository,
} from "./organization/organization-scope.repository.js";
import { OrganizationScopeService } from "./organization/organization-scope.service.js";
import { IdempotencyService } from "./idempotency/idempotency.service.js";

export interface AppModuleOptions {
  readonly config: ApiConfig;
  readonly databasePool: DatabasePool;
  readonly readinessCheck?: DatabaseReadinessCheck;
  readonly closePool?: DatabasePoolClose;
  readonly staffAuthRepository?: StaffAuthRepository;
  readonly organizationScopeRepository?: OrganizationScopeRepository;
  readonly scopedAccessRepository?: ScopedAccessRepository;
  readonly auditRepository?: AuditRepository;
  readonly clock?: Clock;
}

@Module({})
export class AppModule {
  public static register(options: AppModuleOptions): DynamicModule {
    return {
      module: AppModule,
      controllers: [HealthController, StaffAuthController, OrganizationScopeController],
      providers: [
        { provide: API_CONFIG, useValue: options.config },
        { provide: DATABASE_POOL, useValue: options.databasePool },
        {
          provide: DATABASE_READINESS_CHECK,
          useValue: options.readinessCheck ?? checkDatabaseReadiness,
        },
        {
          provide: DATABASE_POOL_CLOSE,
          useValue: options.closePool ?? closeDatabasePool,
        },
        {
          provide: STAFF_AUTH_REPOSITORY,
          useValue:
            options.staffAuthRepository ?? new PostgresStaffAuthRepository(options.databasePool),
        },
        {
          provide: ORGANIZATION_SCOPE_REPOSITORY,
          useValue:
            options.organizationScopeRepository ??
            new PostgresOrganizationScopeRepository(options.databasePool),
        },
        {
          provide: SCOPED_ACCESS_REPOSITORY,
          useValue:
            options.scopedAccessRepository ??
            new PostgresScopedAccessRepository(options.databasePool),
        },
        {
          provide: AUDIT_REPOSITORY,
          useValue: options.auditRepository ?? new PostgresAuditRepository(options.databasePool),
        },
        {
          provide: SESSION_TOKEN_SERVICE,
          useValue: new SessionTokenService({
            secret: options.config.sessionSecret,
            accessTtlMinutes: options.config.staffAccessTokenTtlMinutes,
            refreshTtlDays: options.config.staffRefreshTokenTtlDays,
          }),
        },
        { provide: CLOCK, useValue: options.clock ?? (() => new Date()) },
        HealthService,
        DatabaseLifecycleService,
        PasswordHasher,
        AuthorizationPolicy,
        AuditService,
        { provide: AUDIT_SERVICE, useExisting: AuditService },
        StaffAuthService,
        StaffAuthGuard,
        OrganizationScopeService,
        ScopedAccessService,
        IdempotencyService,
      ],
    };
  }
}
