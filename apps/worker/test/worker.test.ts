import { loadWorkerConfig, type WorkerConfig } from "@anc/config";
import type { DatabasePool, DatabaseReadiness } from "@anc/database";
import { describe, expect, it, vi } from "vitest";

import { JsonWorkerLogger, type WorkerLogRecord } from "../src/logger.js";
import {
  runWorkerOnce,
  WorkerDependencyUnavailableError,
  type WorkerDependencies,
} from "../src/worker.js";

const workerConfig: WorkerConfig = {
  nodeEnv: "test",
  databaseUrl: "postgresql://anc:local-only@localhost:5432/anc_test",
  fcmProjectId: "test-project",
  fcmServiceAccountJson: "synthetic-test-credential",
  reminderIntervalDays: 3,
  pushMaxAttempts: 3,
  pushBackoffSeconds: [30, 120, 300],
  waFallbackEscalationHours: 24,
  primaryTimezone: "Asia/Jakarta",
  logLevel: "info",
};

const readyDatabase: DatabaseReadiness = {
  ready: true,
  checkedAt: "2026-08-08T00:00:00.000Z",
  latencyMs: 2,
};

describe("one-shot worker bootstrap", () => {
  it("validates config, checks the database once, does no jobs, and closes", async () => {
    const pool = createFakePool();
    const records: WorkerLogRecord[] = [];
    const dependencies = dependencyFixture(pool);

    const result = await runWorkerOnce({
      environment: { NODE_ENV: "test" },
      dependencies,
      logger: loggerFor(records),
    });

    expect(result).toEqual({
      status: "bootstrap_complete",
      processedJobs: 0,
      databaseCheckedAt: readyDatabase.checkedAt,
    });
    expect(dependencies.loadConfig).toHaveBeenCalledOnce();
    expect(dependencies.createPool).toHaveBeenCalledWith({
      connectionString: workerConfig.databaseUrl,
      applicationName: "anc-worker",
    });
    expect(dependencies.checkReadiness).toHaveBeenCalledWith(pool);
    expect(dependencies.closePool).toHaveBeenCalledWith(pool);
  });

  it("fails before opening a pool when startup environment is invalid", async () => {
    const createPool = vi.fn();
    const dependencies: WorkerDependencies = {
      loadConfig: loadWorkerConfig,
      createPool,
      checkReadiness: vi.fn(),
      closePool: vi.fn(),
    };

    await expect(
      runWorkerOnce({
        environment: {},
        dependencies,
        logger: loggerFor([]),
      }),
    ).rejects.toThrow("DATABASE_URL");

    expect(createPool).not.toHaveBeenCalled();
  });

  it("fails closed and still closes the pool when readiness is down", async () => {
    const pool = createFakePool();
    const dependencies = dependencyFixture(pool, {
      ready: false,
      checkedAt: "2026-08-08T00:00:00.000Z",
      latencyMs: 5,
      reason: "QUERY_FAILED",
    });

    await expect(runWorkerOnce({ dependencies, logger: loggerFor([]) })).rejects.toBeInstanceOf(
      WorkerDependencyUnavailableError,
    );

    expect(dependencies.closePool).toHaveBeenCalledOnce();
  });

  it("redacts secrets from structured worker logs", () => {
    const records: WorkerLogRecord[] = [];
    const logger = loggerFor(records);

    logger.write("error", "nik=3201010101010001 token=do-not-log", {
      fcmServiceAccountJson: "private-key",
      database: "postgresql://admin:password@private-db/anc",
    });

    const serialized = JSON.stringify(records);
    expect(serialized).not.toContain("3201010101010001");
    expect(serialized).not.toContain("do-not-log");
    expect(serialized).not.toContain("private-key");
    expect(serialized).not.toContain("admin:password");
  });
});

function createFakePool(): DatabasePool {
  const fakeClient = {
    query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
    release: vi.fn(),
  };
  return {
    connect: vi.fn().mockResolvedValue(fakeClient),
  } as unknown as DatabasePool;
}

function dependencyFixture(
  pool: DatabasePool = createFakePool(),
  readiness: DatabaseReadiness = readyDatabase,
): WorkerDependencies {
  return {
    loadConfig: vi.fn(() => workerConfig),
    createPool: vi.fn(() => pool),
    checkReadiness: vi.fn(() => Promise.resolve(readiness)),
    closePool: vi.fn(() => Promise.resolve()),
  };
}

function loggerFor(records: WorkerLogRecord[]): JsonWorkerLogger {
  return new JsonWorkerLogger({
    level: "debug",
    sink: (record) => records.push(record),
  });
}
