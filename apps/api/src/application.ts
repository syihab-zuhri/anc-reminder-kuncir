import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import type { INestApplication } from "@nestjs/common";
import type { ApiConfig } from "@anc/config";
import type { DatabasePool } from "@anc/database";
import { AppModule } from "./app.module.js";
import type { DatabasePoolClose } from "./infrastructure/database-lifecycle.service.js";
import type { DatabaseReadinessCheck } from "./health/health.service.js";
import type { StaffAuthRepository } from "./auth/staff-auth.repository.js";
import type { AuditRepository } from "./audit/audit.repository.js";
import { AuditService } from "./audit/audit.service.js";
import type { Clock } from "./auth/staff-auth.service.js";
import type { OrganizationScopeRepository } from "./organization/organization-scope.repository.js";
import type { ScopedAccessRepository } from "./authorization/scoped-access.repository.js";
import type { MotherRegistryRepository } from "./registry/mother-registry.repository.js";
import type { IdempotencyService } from "./idempotency/idempotency.service.js";
import type { PregnancyLifecycleRepository } from "./registry/pregnancy-lifecycle.repository.js";
import type { MotherAccessCredentialRepository } from "./mother-access/mother-access-credential.repository.js";
import type { MotherAccessCodeService } from "./mother-access/mother-access-code.service.js";
import type { MotherAuthRepository } from "./mother-access/mother-auth.repository.js";
import type { AncPlanRepository } from "./anc-plan/anc-plan.repository.js";
import type { MilestoneScheduleRepository } from "./milestone-schedule/milestone-schedule.repository.js";
import type { VisitConfirmationRepository } from "./visit-confirmation/visit-confirmation.repository.js";
import type { ClinicalRecordRepository } from "./clinical-record/clinical-record.repository.js";
import type { OperationalQueriesRepository } from "./operational-queries/operational-queries.repository.js";
import type { DashboardRepository } from "./dashboard/dashboard.repository.js";
import { CanonicalErrorFilter } from "./errors/canonical-error.filter.js";
import { HttpLoggingInterceptor } from "./observability/http-logging.interceptor.js";
import { JsonLogger } from "./observability/json-logger.js";
import { requestContextMiddleware } from "./observability/request-context.js";

export const API_GLOBAL_PREFIX = "api/v1";

export interface CreateApiApplicationOptions {
  readonly config: ApiConfig;
  readonly databasePool: DatabasePool;
  readonly readinessCheck?: DatabaseReadinessCheck;
  readonly closePool?: DatabasePoolClose;
  readonly logger?: JsonLogger;
  readonly enableShutdownHooks?: boolean;
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
  readonly auditRepository?: AuditRepository;
  readonly idempotencyService?: IdempotencyService;
  readonly clock?: Clock;
}

export async function createApiApplication(
  options: CreateApiApplicationOptions,
): Promise<INestApplication> {
  const logger =
    options.logger ??
    new JsonLogger({
      service: "anc-api",
      level: options.config.logLevel,
    });
  const app = await NestFactory.create(
    AppModule.register({
      config: options.config,
      databasePool: options.databasePool,
      ...(options.readinessCheck === undefined ? {} : { readinessCheck: options.readinessCheck }),
      ...(options.closePool === undefined ? {} : { closePool: options.closePool }),
      ...(options.staffAuthRepository === undefined
        ? {}
        : { staffAuthRepository: options.staffAuthRepository }),
      ...(options.organizationScopeRepository === undefined
        ? {}
        : { organizationScopeRepository: options.organizationScopeRepository }),
      ...(options.scopedAccessRepository === undefined
        ? {}
        : { scopedAccessRepository: options.scopedAccessRepository }),
      ...(options.motherRegistryRepository === undefined
        ? {}
        : { motherRegistryRepository: options.motherRegistryRepository }),
      ...(options.pregnancyLifecycleRepository === undefined
        ? {}
        : { pregnancyLifecycleRepository: options.pregnancyLifecycleRepository }),
      ...(options.motherAccessCredentialRepository === undefined
        ? {}
        : { motherAccessCredentialRepository: options.motherAccessCredentialRepository }),
      ...(options.motherAccessCodeService === undefined
        ? {}
        : { motherAccessCodeService: options.motherAccessCodeService }),
      ...(options.motherAuthRepository === undefined
        ? {}
        : { motherAuthRepository: options.motherAuthRepository }),
      ...(options.ancPlanRepository === undefined
        ? {}
        : { ancPlanRepository: options.ancPlanRepository }),
      ...(options.milestoneScheduleRepository === undefined
        ? {}
        : { milestoneScheduleRepository: options.milestoneScheduleRepository }),
      ...(options.visitConfirmationRepository === undefined
        ? {}
        : { visitConfirmationRepository: options.visitConfirmationRepository }),
      ...(options.clinicalRecordRepository === undefined
        ? {}
        : { clinicalRecordRepository: options.clinicalRecordRepository }),
      ...(options.operationalQueriesRepository === undefined
        ? {}
        : { operationalQueriesRepository: options.operationalQueriesRepository }),
      ...(options.dashboardRepository === undefined
        ? {}
        : { dashboardRepository: options.dashboardRepository }),
      ...(options.auditRepository === undefined
        ? {}
        : { auditRepository: options.auditRepository }),
      ...(options.idempotencyService === undefined
        ? {}
        : { idempotencyService: options.idempotencyService }),
      ...(options.clock === undefined ? {} : { clock: options.clock }),
    }),
    { logger },
  );

  app.use(requestContextMiddleware);
  app.setGlobalPrefix(API_GLOBAL_PREFIX);
  app.useGlobalInterceptors(new HttpLoggingInterceptor(logger));
  app.useGlobalFilters(new CanonicalErrorFilter(logger, app.get(AuditService)));

  if (options.enableShutdownHooks === true) {
    app.enableShutdownHooks();
  }

  return app;
}
