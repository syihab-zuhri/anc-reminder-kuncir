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
  API_CONFIG,
  DATABASE_POOL,
  DATABASE_POOL_CLOSE,
  DATABASE_READINESS_CHECK,
} from "./infrastructure/tokens.js";

export interface AppModuleOptions {
  readonly config: ApiConfig;
  readonly databasePool: DatabasePool;
  readonly readinessCheck?: DatabaseReadinessCheck;
  readonly closePool?: DatabasePoolClose;
}

@Module({})
export class AppModule {
  public static register(options: AppModuleOptions): DynamicModule {
    return {
      module: AppModule,
      controllers: [HealthController],
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
        HealthService,
        DatabaseLifecycleService,
      ],
    };
  }
}
