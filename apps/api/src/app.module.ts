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
  MOTHER_REGISTRY_REPOSITORY,
  PREGNANCY_LIFECYCLE_REPOSITORY,
  MOTHER_ACCESS_CREDENTIAL_REPOSITORY,
  MOTHER_AUTH_REPOSITORY,
  SCOPED_ACCESS_REPOSITORY,
  SESSION_TOKEN_SERVICE,
  STAFF_AUTH_REPOSITORY,
  IDEMPOTENCY_SERVICE,
  ANC_PLAN_REPOSITORY,
  MILESTONE_SCHEDULE_REPOSITORY,
  VISIT_CONFIRMATION_REPOSITORY,
  CLINICAL_RECORD_REPOSITORY,
  OPERATIONAL_QUERIES_REPOSITORY,
  DASHBOARD_REPOSITORY,
  WA_FALLBACK_REPOSITORY,
} from "./infrastructure/tokens.js";
import { WaFallbackController } from "./wa-fallback/wa-fallback.controller.js";
import {
  PostgresWaFallbackRepository,
  type WaFallbackRepository,
} from "./wa-fallback/wa-fallback.repository.js";
import { WaFallbackService } from "./wa-fallback/wa-fallback.service.js";
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
import { MotherRegistryController } from "./registry/mother-registry.controller.js";
import { MotherRegistryService } from "./registry/mother-registry.service.js";
import {
  PostgresMotherRegistryRepository,
  type MotherRegistryRepository,
} from "./registry/mother-registry.repository.js";
import { NikCipher } from "./registry/nik-cipher.js";
import { PregnancyLifecycleController } from "./registry/pregnancy-lifecycle.controller.js";
import {
  PostgresPregnancyLifecycleRepository,
  type PregnancyLifecycleRepository,
} from "./registry/pregnancy-lifecycle.repository.js";
import { PregnancyLifecycleService } from "./registry/pregnancy-lifecycle.service.js";
import { MotherAccessCredentialController } from "./mother-access/mother-access-credential.controller.js";
import {
  PostgresMotherAccessCredentialRepository,
  type MotherAccessCredentialRepository,
} from "./mother-access/mother-access-credential.repository.js";
import { MotherAccessCredentialService } from "./mother-access/mother-access-credential.service.js";
import { MotherAccessCodeService } from "./mother-access/mother-access-code.service.js";
import { MotherAccessCryptoService } from "./mother-access/mother-access-crypto.service.js";
import { MotherAuthController } from "./mother-access/mother-auth.controller.js";
import { MotherAuthGuard } from "./mother-access/mother-auth.guard.js";
import {
  PostgresMotherAuthRepository,
  type MotherAuthRepository,
} from "./mother-access/mother-auth.repository.js";
import { MotherAuthService } from "./mother-access/mother-auth.service.js";
import { AncPlanController } from "./anc-plan/anc-plan.controller.js";
import {
  PostgresAncPlanRepository,
  type AncPlanRepository,
} from "./anc-plan/anc-plan.repository.js";
import { AncPlanService } from "./anc-plan/anc-plan.service.js";
import { MilestoneScheduleController } from "./milestone-schedule/milestone-schedule.controller.js";
import {
  PostgresMilestoneScheduleRepository,
  type MilestoneScheduleRepository,
} from "./milestone-schedule/milestone-schedule.repository.js";
import { MilestoneScheduleService } from "./milestone-schedule/milestone-schedule.service.js";
import { VisitConfirmationController } from "./visit-confirmation/visit-confirmation.controller.js";
import {
  PostgresVisitConfirmationRepository,
  type VisitConfirmationRepository,
} from "./visit-confirmation/visit-confirmation.repository.js";
import { VisitConfirmationService } from "./visit-confirmation/visit-confirmation.service.js";
import { ClinicalRecordController } from "./clinical-record/clinical-record.controller.js";
import {
  PostgresClinicalRecordRepository,
  type ClinicalRecordRepository,
} from "./clinical-record/clinical-record.repository.js";
import { ClinicalRecordService } from "./clinical-record/clinical-record.service.js";
import { OperationalQueriesController } from "./operational-queries/operational-queries.controller.js";
import {
  PostgresOperationalQueriesRepository,
  type OperationalQueriesRepository,
} from "./operational-queries/operational-queries.repository.js";
import { OperationalQueriesService } from "./operational-queries/operational-queries.service.js";
import { DashboardController } from "./dashboard/dashboard.controller.js";
import { MotherDashboardController } from "./dashboard/mother-dashboard.controller.js";
import {
  PostgresDashboardRepository,
  type DashboardRepository,
} from "./dashboard/dashboard.repository.js";
import { DashboardService } from "./dashboard/dashboard.service.js";

export interface AppModuleOptions {
  readonly config: ApiConfig;
  readonly databasePool: DatabasePool;
  readonly readinessCheck?: DatabaseReadinessCheck;
  readonly closePool?: DatabasePoolClose;
  readonly staffAuthRepository?: StaffAuthRepository;
  readonly organizationScopeRepository?: OrganizationScopeRepository;
  readonly scopedAccessRepository?: ScopedAccessRepository;
  readonly motherRegistryRepository?: MotherRegistryRepository;
  readonly pregnancyLifecycleRepository?: PregnancyLifecycleRepository;
  readonly motherAccessCredentialRepository?: MotherAccessCredentialRepository;
  readonly motherAccessCodeService?: MotherAccessCodeService;
  readonly motherAuthRepository?: MotherAuthRepository;
  readonly ancPlanRepository?: AncPlanRepository;
  readonly milestoneScheduleRepository?: MilestoneScheduleRepository;
  readonly visitConfirmationRepository?: VisitConfirmationRepository;
  readonly clinicalRecordRepository?: ClinicalRecordRepository;
  readonly operationalQueriesRepository?: OperationalQueriesRepository;
  readonly dashboardRepository?: DashboardRepository;
  readonly waFallbackRepository?: WaFallbackRepository;
  readonly auditRepository?: AuditRepository;
  readonly idempotencyService?: IdempotencyService;
  readonly clock?: Clock;
}

@Module({})
export class AppModule {
  public static register(options: AppModuleOptions): DynamicModule {
    return {
      module: AppModule,
      controllers: [
        HealthController,
        StaffAuthController,
        OrganizationScopeController,
        MotherRegistryController,
        PregnancyLifecycleController,
        MotherAccessCredentialController,
        MotherAuthController,
        AncPlanController,
        MilestoneScheduleController,
        VisitConfirmationController,
        ClinicalRecordController,
        OperationalQueriesController,
        DashboardController,
        MotherDashboardController,
        WaFallbackController,
      ],
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
          provide: MOTHER_REGISTRY_REPOSITORY,
          useValue:
            options.motherRegistryRepository ??
            new PostgresMotherRegistryRepository(options.config.nodeEnv !== "production"),
        },
        {
          provide: PREGNANCY_LIFECYCLE_REPOSITORY,
          useValue:
            options.pregnancyLifecycleRepository ??
            new PostgresPregnancyLifecycleRepository(options.config.nodeEnv !== "production"),
        },
        {
          provide: MOTHER_ACCESS_CREDENTIAL_REPOSITORY,
          useValue:
            options.motherAccessCredentialRepository ??
            new PostgresMotherAccessCredentialRepository(),
        },
        {
          provide: MOTHER_AUTH_REPOSITORY,
          useValue:
            options.motherAuthRepository ?? new PostgresMotherAuthRepository(options.databasePool),
        },
        {
          provide: ANC_PLAN_REPOSITORY,
          useValue:
            options.ancPlanRepository ??
            new PostgresAncPlanRepository(
              options.databasePool,
              options.config.nodeEnv !== "production",
            ),
        },
        {
          provide: MILESTONE_SCHEDULE_REPOSITORY,
          useValue:
            options.milestoneScheduleRepository ?? new PostgresMilestoneScheduleRepository(),
        },
        {
          provide: VISIT_CONFIRMATION_REPOSITORY,
          useValue:
            options.visitConfirmationRepository ?? new PostgresVisitConfirmationRepository(),
        },
        {
          provide: CLINICAL_RECORD_REPOSITORY,
          useValue:
            options.clinicalRecordRepository ??
            new PostgresClinicalRecordRepository(options.databasePool),
        },
        {
          provide: OPERATIONAL_QUERIES_REPOSITORY,
          useValue:
            options.operationalQueriesRepository ??
            new PostgresOperationalQueriesRepository(options.databasePool),
        },
        {
          provide: DASHBOARD_REPOSITORY,
          useValue:
            options.dashboardRepository ?? new PostgresDashboardRepository(options.databasePool),
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
        {
          provide: IDEMPOTENCY_SERVICE,
          useValue:
            options.idempotencyService ??
            new IdempotencyService(options.databasePool, options.config),
        },
        {
          provide: NikCipher,
          useFactory: (config: ApiConfig) => new NikCipher(config.nikEncryptionKey),
          inject: [API_CONFIG],
        },
        { provide: CLOCK, useValue: options.clock ?? (() => new Date()) },
        HealthService,
        DatabaseLifecycleService,
        PasswordHasher,
        {
          provide: MotherAccessCryptoService,
          useFactory: (config: ApiConfig) =>
            new MotherAccessCryptoService(config.motherSessionSecret, config.motherSessionTtlDays),
          inject: [API_CONFIG],
        },
        {
          provide: MotherAccessCodeService,
          useFactory: (hasher: PasswordHasher, crypto: MotherAccessCryptoService) =>
            options.motherAccessCodeService ?? new MotherAccessCodeService(hasher, crypto),
          inject: [PasswordHasher, MotherAccessCryptoService],
        },
        AuthorizationPolicy,
        AuditService,
        { provide: AUDIT_SERVICE, useExisting: AuditService },
        StaffAuthService,
        StaffAuthGuard,
        OrganizationScopeService,
        ScopedAccessService,
        MotherRegistryService,
        PregnancyLifecycleService,
        MotherAccessCredentialService,
        MotherAuthService,
        MotherAuthGuard,
        AncPlanService,
        MilestoneScheduleService,
        VisitConfirmationService,
        ClinicalRecordService,
        OperationalQueriesService,
        DashboardService,
        {
          provide: WA_FALLBACK_REPOSITORY,
          useFactory: (pool: DatabasePool) =>
            options.waFallbackRepository ?? new PostgresWaFallbackRepository(pool),
          inject: [DATABASE_POOL],
        },
        {
          provide: WaFallbackService,
          useFactory: (repo: PostgresWaFallbackRepository) => new WaFallbackService(repo),
          inject: [WA_FALLBACK_REPOSITORY],
        },
      ],
    };
  }
}
