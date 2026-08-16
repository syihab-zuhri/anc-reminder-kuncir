import { describe, expect, it } from "vitest";
import type { DatabasePool } from "@anc/database";
import { apiConfigFixture } from "./fixtures.js";
import { InternalSchedulerService } from "../src/scheduler/scheduler.service.js";
import { NoopPushAdapter } from "../src/scheduler/push-adapter.js";

function createMockPool(
  options: {
    readonly queryMock?: (
      sql: string,
      params?: unknown[],
    ) => Promise<{ rowCount?: number; rows: unknown[] }>;
  } = {},
): DatabasePool {
  const queryFn = options.queryMock ?? (() => Promise.resolve({ rowCount: 0, rows: [] }));
  const mockClient = {
    query: queryFn,
    release: () => {},
  };
  return {
    query: queryFn,
    connect: () => Promise.resolve(mockClient),
    end: () => Promise.resolve(),
  } as unknown as DatabasePool;
}

describe("InternalSchedulerService", () => {
  it("initializes without error and respects schedulerEnabled: false", () => {
    const config = {
      ...apiConfigFixture(),
      schedulerEnabled: false,
    };
    const pool = createMockPool();
    const service = new InternalSchedulerService(config, pool);

    expect(() => service.onApplicationBootstrap()).not.toThrow();
    expect(() => service.onApplicationShutdown()).not.toThrow();
  });

  it("executes a tick deterministically using custom clock and mock pool", async () => {
    const config = {
      ...apiConfigFixture(),
      schedulerEnabled: false,
      reminderIntervalDays: 3,
      primaryTimezone: "Asia/Jakarta" as const,
    };
    const executedQueries: string[] = [];
    const pool = createMockPool({
      queryMock: (sql) => {
        executedQueries.push(sql);
        return Promise.resolve({ rowCount: 0, rows: [] });
      },
    });

    const fakeNow = new Date("2026-08-16T10:00:00.000Z");
    const service = new InternalSchedulerService(
      config,
      pool,
      new NoopPushAdapter(),
      () => fakeNow,
    );

    const result = await service.tick(fakeNow);

    expect(result.processedJobs).toBe(0);
    expect(result.reminderResult.createdCyclesCount).toBe(0);
    expect(result.pushResult.processedAttemptsCount).toBe(0);
    expect(executedQueries.length).toBeGreaterThan(0);
  });

  it("handles concurrent tick calls safely by skipping duplicate executions", async () => {
    const config = {
      ...apiConfigFixture(),
      schedulerEnabled: false,
    };
    let unblock: () => void = () => {};
    const delay = new Promise<void>((resolve) => {
      unblock = resolve;
    });

    let firstQuery = true;
    const pool = createMockPool({
      queryMock: async () => {
        if (firstQuery) {
          firstQuery = false;
          await delay;
        }
        return { rowCount: 0, rows: [] };
      },
    });

    const service = new InternalSchedulerService(config, pool);

    const tick1Promise = service.tick();
    const tick2Promise = service.tick();

    const tick2Result = await tick2Promise;
    expect(tick2Result.processedJobs).toBe(0);

    unblock();
    const tick1Result = await tick1Promise;
    expect(tick1Result.processedJobs).toBe(0);
  });
});
