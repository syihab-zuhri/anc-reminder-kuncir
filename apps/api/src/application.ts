import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import type { INestApplication } from "@nestjs/common";
import type { ApiConfig } from "@anc/config";
import type { DatabasePool } from "@anc/database";
import { AppModule } from "./app.module.js";
import type { DatabasePoolClose } from "./infrastructure/database-lifecycle.service.js";
import type { DatabaseReadinessCheck } from "./health/health.service.js";
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
    }),
    { logger },
  );

  app.use(requestContextMiddleware);
  app.setGlobalPrefix(API_GLOBAL_PREFIX);
  app.useGlobalInterceptors(new HttpLoggingInterceptor(logger));
  app.useGlobalFilters(new CanonicalErrorFilter(logger));

  if (options.enableShutdownHooks === true) {
    app.enableShutdownHooks();
  }

  return app;
}
