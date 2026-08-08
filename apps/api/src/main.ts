import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { loadApiConfig } from "@anc/config";
import { closeDatabasePool, createDatabasePool, type DatabasePool } from "@anc/database";
import type { INestApplication } from "@nestjs/common";
import { createApiApplication } from "./application.js";
import { JsonLogger } from "./observability/json-logger.js";

export async function bootstrapApi(): Promise<INestApplication> {
  const config = loadApiConfig(process.env);
  const logger = new JsonLogger({ service: "anc-api", level: config.logLevel });
  const databasePool = createDatabasePool({
    connectionString: config.databaseUrl,
    applicationName: "anc-api",
  });
  let app: INestApplication | undefined;

  try {
    app = await createApiApplication({
      config,
      databasePool,
      logger,
      enableShutdownHooks: true,
    });
    await app.listen(config.apiPort, config.apiHost);
    logger.write("info", "API started", {
      event: "api_started",
      host: config.apiHost,
      port: config.apiPort,
    });
    return app;
  } catch (error) {
    await closePartiallyStartedApplication(app, databasePool);
    logger.write("fatal", "API startup failed", {
      event: "api_startup_failed",
      error_name: error instanceof Error ? error.name : "UnknownError",
    });
    throw error;
  }
}

async function closePartiallyStartedApplication(
  app: INestApplication | undefined,
  databasePool: DatabasePool,
): Promise<void> {
  if (app !== undefined) {
    await app.close();
    return;
  }
  await closeDatabasePool(databasePool);
}

function isEntrypoint(): boolean {
  const entrypoint = process.argv[1];
  return entrypoint !== undefined && pathToFileURL(resolve(entrypoint)).href === import.meta.url;
}

if (isEntrypoint()) {
  void bootstrapApi().catch(() => {
    process.exitCode = 1;
  });
}
