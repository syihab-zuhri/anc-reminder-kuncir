import { loadWorkerConfig, type WorkerConfig } from "@anc/config";
import {
  checkDatabaseReadiness,
  closeDatabasePool,
  createDatabasePool,
  DeviceTokenCrypto,
  type DatabasePool,
  type DatabaseReadiness,
} from "@anc/database";
import { JsonWorkerLogger, type WorkerLogger } from "./logger.js";
import { localDateString, processReminderCycles } from "./reminder-processor.js";
import { createFcmPushAdapter, type PushDeliveryAdapter } from "./push-adapter.js";
import { processPendingPushAttempts } from "./push-processor.js";

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
  readonly pushAdapter?: PushDeliveryAdapter;
  readonly now?: Date;
}

export interface WorkerRunResult {
  readonly status: "bootstrap_complete";
  readonly processedJobs: number;
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
    mode: "reminder_delivery",
  });

  try {
    const readiness = await dependencies.checkReadiness(pool);
    if (!readiness.ready) {
      throw new WorkerDependencyUnavailableError();
    }

    const anchorDate = localDateString(options.now ?? new Date(), config.primaryTimezone);
    const reminderResult = await processReminderCycles(pool, anchorDate, {
      intervalDays: config.reminderIntervalDays,
    });
    const pushResult = await processPendingPushAttempts(
      pool,
      options.pushAdapter ??
        createFcmPushAdapter(config.fcmProjectId, config.fcmServiceAccountJson),
      new DeviceTokenCrypto(config.pushTokenEncryptionKey),
      { maxAttempts: config.pushMaxAttempts, backoffSeconds: config.pushBackoffSeconds },
      options.now === undefined ? {} : { now: options.now },
    );

    const result: WorkerRunResult = {
      status: "bootstrap_complete",
      processedJobs: reminderResult.createdCyclesCount + pushResult.processedAttemptsCount,
      databaseCheckedAt: readiness.checkedAt,
    };
    logger.write("info", "Worker one-shot bootstrap completed", {
      event: "worker_bootstrap_completed",
      processed_jobs: result.processedJobs,
      database_checked_at: result.databaseCheckedAt,
      reminder_cycles_created: reminderResult.createdCyclesCount,
      push_attempts_created: reminderResult.pushAttemptsCount,
      wa_fallbacks_created: reminderResult.waFallbackActionsCount,
      push_attempts_processed: pushResult.processedAttemptsCount,
      push_attempts_succeeded: pushResult.succeededCount,
      push_retries_scheduled: pushResult.retriesScheduledCount,
      push_terminal_failures: pushResult.terminalFailuresCount,
      push_wa_fallbacks_created: pushResult.waFallbackActionsCount,
    });
    return result;
  } finally {
    await dependencies.closePool(pool);
    logger.write("info", "Worker database pool closed", {
      event: "worker_database_pool_closed",
    });
  }
}
