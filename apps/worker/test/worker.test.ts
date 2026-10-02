import { loadWorkerConfig, type WorkerConfig } from "@anc/config";
import type { DatabasePool, DatabaseReadiness } from "@anc/database";
import { describe, expect, it, vi } from "vitest";

import { localDateString, localHour } from "../src/reminder-processor.js";
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
  fcmServiceAccountJson: JSON.stringify({
    client_email: "synthetic@example.test",
    private_key: "synthetic-private-key",
  }),
  pushTokenEncryptionKey: Buffer.from("p".repeat(32)).toString("base64"),
  reminderIntervalDays: 3,
  reminderSendHour: 8,
  pushMaxAttempts: 3,
  pushBackoffSeconds: [30, 120, 300],
  waFallbackEscalationHours: 24,
  primaryTimezone: "Asia/Jakarta",
  logLevel: "info",
};

// 2026-10-08 10:00 in Asia/Jakarta (UTC+7), inside the reminder send window.
const jakartaMorning = new Date("2026-10-08T03:00:00.000Z");

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

  it("anchors reminder cycles in the configured time zone and enforces the configured cadence", async () => {
    const statements: Array<{ sql: string; params: unknown[] }> = [];
    const pool = createFakePool(statements);
    const dependencies = dependencyFixture(pool);

    await runWorkerOnce({
      environment: { NODE_ENV: "test" },
      dependencies,
      logger: loggerFor([]),
      now: jakartaMorning,
    });

    const eligibility = statements.find(isEligibilityQuery);
    expect(eligibility).toBeDefined();
    expect(eligibility?.params?.[0]).toBe("2026-10-08");
    expect(eligibility?.params?.[1]).toBe(workerConfig.reminderIntervalDays);
    expect(eligibility?.params?.[2]).toBe(workerConfig.primaryTimezone);
  });

  it("opens no reminder cycles before the local send hour but keeps processing push retries", async () => {
    const statements: Array<{ sql: string; params: unknown[] }> = [];
    const records: WorkerLogRecord[] = [];

    // 00:30 in Jakarta on the day K1 reminders would start.
    await runWorkerOnce({
      environment: { NODE_ENV: "test" },
      dependencies: dependencyFixture(createFakePool(statements)),
      logger: loggerFor(records),
      now: new Date("2026-10-07T17:30:00.000Z"),
    });

    expect(statements.some(isEligibilityQuery)).toBe(false);
    expect(statements.some((entry) => entry.sql.includes("FROM push_attempts pa"))).toBe(true);
    const completed = records.find(
      (record) =>
        (record.data as { event?: string } | undefined)?.event === "worker_bootstrap_completed",
    );
    expect(completed?.data).toMatchObject({
      reminder_send_window_open: false,
      reminder_cycles_created: 0,
    });
  });

  it("opens the send window exactly at the configured local hour", async () => {
    const runAt = async (now: Date, reminderSendHour = 8): Promise<boolean> => {
      const statements: Array<{ sql: string; params: unknown[] }> = [];
      const dependencies: WorkerDependencies = {
        ...dependencyFixture(createFakePool(statements)),
        loadConfig: vi.fn(() => ({ ...workerConfig, reminderSendHour })),
      };
      await runWorkerOnce({ dependencies, logger: loggerFor([]), now });
      return statements.some(isEligibilityQuery);
    };

    expect(await runAt(new Date("2026-10-08T00:59:59.000Z"))).toBe(false); // 07:59:59 WIB
    expect(await runAt(new Date("2026-10-08T01:00:00.000Z"))).toBe(true); // 08:00:00 WIB
    expect(await runAt(new Date("2026-10-08T16:59:59.000Z"))).toBe(true); // 23:59:59 WIB
    expect(await runAt(new Date("2026-10-07T17:00:00.000Z"), 0)).toBe(true); // 00:00 WIB, hour 0
  });

  it("reads the hour in the configured time zone, never in UTC", () => {
    expect(localHour(new Date("2026-10-07T17:00:00.000Z"), "Asia/Jakarta")).toBe(0);
    expect(localHour(new Date("2026-10-08T01:00:00.000Z"), "Asia/Jakarta")).toBe(8);
    expect(localHour(new Date("2026-10-08T16:59:00.000Z"), "Asia/Jakarta")).toBe(23);
    expect(localDateString(new Date("2026-10-07T17:00:00.000Z"), "Asia/Jakarta")).toBe(
      "2026-10-08",
    );
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

function isEligibilityQuery(entry: { sql: string }): boolean {
  return (
    entry.sql.includes("FROM pregnancy_milestones pm") ||
    entry.sql.includes("JOIN pregnancy_milestones pm")
  );
}

function createFakePool(statements: Array<{ sql: string; params: unknown[] }> = []): DatabasePool {
  const fakeClient = {
    query: vi.fn((sql: string, params: unknown[] = []) => {
      statements.push({ sql, params });
      return Promise.resolve({ rows: [], rowCount: 0 });
    }),
    release: vi.fn(),
  };
  return {
    query: vi.fn((sql: string, params: unknown[] = []) => {
      statements.push({ sql, params });
      return Promise.resolve({ rows: [], rowCount: 0 });
    }),
    connect: vi.fn(() => Promise.resolve(fakeClient)),
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
