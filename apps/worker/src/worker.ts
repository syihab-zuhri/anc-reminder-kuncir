import { loadWorkerConfig, type WorkerConfig } from "@anc/config";
import {
  checkDatabaseReadiness,
  closeDatabasePool,
  createDatabasePool,
  type DatabasePool,
  type DatabaseReadiness,
} from "@anc/database";
import { JsonWorkerLogger, type WorkerLogger } from "./logger.js";

export interface WorkerDependencies {
  readonly loadConfig: (environment: NodeJS.ProcessEnv) => WorkerConfig;
  readonly createPool: typeof createDatabasePool;
  readonly checkReadiness: (pool: DatabasePool) => Promise<DatabaseReadiness>;
  readonly closePool: (pool: DatabasePool) => Promise<void>;
}

export interface RunWorkerOnceOptions {
  readonly environment?: NodeJS.ProcessEnv;
  readonly dependencies?: Partial<WorkerDependencies>;
  readonly logger?: WorkerLogger;
}

export interface WorkerRunResult {
  readonly status: "bootstrap_complete";
  readonly processedJobs: 0;
  readonly databaseCheckedAt: string;
}

export class WorkerDependencyUnavailableError extends Error {
  public constructor() {
    super("A required worker dependency is unavailable");
    this.name = "WorkerDependencyUnavailableError";
  }
}

const defaultDependencies: WorkerDependencies = {
  loadConfig: loadWorkerConfig,
  createPool: createDatabasePool,
  checkReadiness: checkDatabaseReadiness,
  closePool: closeDatabasePool,
};

export async function runWorkerOnce(options: RunWorkerOnceOptions = {}): Promise<WorkerRunResult> {
  const dependencies: WorkerDependencies = {
    ...defaultDependencies,
    ...options.dependencies,
  };
  const config = dependencies.loadConfig(options.environment ?? process.env);
  const logger = options.logger ?? new JsonWorkerLogger({ level: config.logLevel });
  const pool = dependencies.createPool({
    connectionString: config.databaseUrl,
    applicationName: "anc-worker",
  });

  logger.write("info", "Worker one-shot bootstrap started", {
    event: "worker_bootstrap_started",
    mode: "foundation_only",
  });

  try {
    const readiness = await dependencies.checkReadiness(pool);
    if (!readiness.ready) {
      throw new WorkerDependencyUnavailableError();
    }

    const result: WorkerRunResult = {
      status: "bootstrap_complete",
      processedJobs: 0,
      databaseCheckedAt: readiness.checkedAt,
    };
    logger.write("info", "Worker one-shot bootstrap completed", {
      event: "worker_bootstrap_completed",
      processed_jobs: result.processedJobs,
      database_checked_at: result.databaseCheckedAt,
      reminder_processing: "not_implemented",
    });
    return result;
  } finally {
    await dependencies.closePool(pool);
    logger.write("info", "Worker database pool closed", {
      event: "worker_database_pool_closed",
    });
  }
}
