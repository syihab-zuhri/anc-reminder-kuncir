import { describe, expect, it } from "vitest";

import {
  IdempotencyKeyConflictError,
  runIdempotentMutation,
  type DatabasePool,
} from "../src/index.js";

const idempotencyKey = "8b26fdbd-6306-4bbf-9765-3fd620888e7c";
const resourceId = "420b7443-b87c-4728-bbf5-cbe6eff22c59";
const baseInput = {
  actorKey: "STAFF:0d5e8c8f-0f39-4b4e-87f5-30ac3c0c80bc",
  operation: "TEST_MUTATION",
  idempotencyKey,
  requestHash: "a".repeat(64),
} as const;

describe("idempotent transaction coordinator", () => {
  it("executes once and reconstructs a completed replay", async () => {
    const database = new FakeIdempotencyDatabase();
    let executionCount = 0;
    let replayCount = 0;

    const first = await runIdempotentMutation(
      database.pool(),
      baseInput,
      () => {
        executionCount += 1;
        return Promise.resolve({ resourceType: "TEST_RESOURCE", resourceId, value: "created" });
      },
      () => {
        replayCount += 1;
        return Promise.resolve("loaded");
      },
    );
    const second = await runIdempotentMutation(
      database.pool(),
      baseInput,
      () => {
        executionCount += 1;
        return Promise.resolve({ resourceType: "TEST_RESOURCE", resourceId, value: "duplicate" });
      },
      () => {
        replayCount += 1;
        return Promise.resolve("loaded");
      },
    );

    expect(first).toEqual({
      resourceType: "TEST_RESOURCE",
      resourceId,
      replayed: false,
      value: "created",
    });
    expect(second).toEqual({
      resourceType: "TEST_RESOURCE",
      resourceId,
      replayed: true,
      value: "loaded",
    });
    expect(executionCount).toBe(1);
    expect(replayCount).toBe(1);
    expect(database.releaseCount).toBe(2);
  });

  it("rejects reuse of the same key for a different request", async () => {
    const database = new FakeIdempotencyDatabase();
    await runIdempotentMutation(
      database.pool(),
      baseInput,
      () => Promise.resolve({ resourceType: "TEST_RESOURCE", resourceId, value: true }),
      () => Promise.resolve(true),
    );

    await expect(
      runIdempotentMutation(
        database.pool(),
        { ...baseInput, requestHash: "b".repeat(64) },
        () => Promise.resolve({ resourceType: "TEST_RESOURCE", resourceId, value: true }),
        () => Promise.resolve(true),
      ),
    ).rejects.toBeInstanceOf(IdempotencyKeyConflictError);
  });

  it("rolls back and retries serialization failures only", async () => {
    const database = new FakeIdempotencyDatabase();
    let attempt = 0;
    const result = await runIdempotentMutation(
      database.pool(),
      baseInput,
      () => {
        attempt += 1;
        if (attempt === 1) {
          return Promise.reject(
            Object.assign(new Error("serialization failure"), { code: "40001" }),
          );
        }
        return Promise.resolve({ resourceType: "TEST_RESOURCE", resourceId, value: "recovered" });
      },
      () => Promise.resolve("replayed"),
    );

    expect(result.value).toBe("recovered");
    expect(attempt).toBe(2);
    expect(database.rollbackCount).toBe(1);
  });
});

interface StoredRecord {
  requestHash: string;
  resourceType: string | null;
  resourceId: string | null;
  completedAt: Date | null;
}

interface FakeQueryResult {
  readonly rows: readonly Record<string, unknown>[];
  readonly rowCount: number;
}

class FakeIdempotencyDatabase {
  public releaseCount = 0;
  public rollbackCount = 0;
  private record: StoredRecord | undefined;
  private snapshot: StoredRecord | undefined;

  public pool(): Pick<DatabasePool, "connect"> {
    const client = {
      query: (sql: string, parameters: readonly unknown[] = []) => this.query(sql, parameters),
      release: () => {
        this.releaseCount += 1;
      },
    };
    return {
      connect: () => Promise.resolve(client),
    } as unknown as Pick<DatabasePool, "connect">;
  }

  private query(sql: string, parameters: readonly unknown[]): Promise<FakeQueryResult> {
    const normalized = sql.replace(/\s+/gu, " ").trim();
    if (normalized.startsWith("BEGIN")) {
      this.snapshot = cloneRecord(this.record);
      return result();
    }
    if (normalized === "COMMIT") {
      this.snapshot = undefined;
      return result();
    }
    if (normalized === "ROLLBACK") {
      this.record = cloneRecord(this.snapshot);
      this.snapshot = undefined;
      this.rollbackCount += 1;
      return result();
    }
    if (normalized.startsWith("SELECT pg_advisory_xact_lock")) return result();
    if (normalized.startsWith("SELECT request_hash")) {
      return Promise.resolve(
        this.record === undefined
          ? resultValue()
          : resultValue({
              request_hash: this.record.requestHash,
              result_resource_type: this.record.resourceType,
              result_resource_id: this.record.resourceId,
              completed_at: this.record.completedAt,
            }),
      );
    }
    if (normalized.startsWith("INSERT INTO api_idempotency_records")) {
      this.record = {
        requestHash: requireString(parameters[4]),
        resourceType: null,
        resourceId: null,
        completedAt: null,
      };
      return result();
    }
    if (normalized.startsWith("UPDATE api_idempotency_records")) {
      if (this.record === undefined) return result();
      this.record.resourceType = requireString(parameters[1]);
      this.record.resourceId = requireString(parameters[2]);
      this.record.completedAt = new Date("2026-08-08T15:00:00.000Z");
      return Promise.resolve({ rows: [{ id: parameters[0] }], rowCount: 1 });
    }
    throw new Error(`Unexpected fake SQL: ${normalized}`);
  }
}

function result(): Promise<FakeQueryResult> {
  return Promise.resolve(resultValue());
}

function resultValue(row?: Record<string, unknown>): FakeQueryResult {
  return { rows: row === undefined ? [] : [row], rowCount: row === undefined ? 0 : 1 };
}

function cloneRecord(record: StoredRecord | undefined): StoredRecord | undefined {
  return record === undefined ? undefined : { ...record };
}

function requireString(value: unknown): string {
  if (typeof value !== "string") throw new Error("Expected fake SQL string parameter");
  return value;
}
