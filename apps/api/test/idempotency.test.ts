import { describe, expect, it } from "vitest";
import type { DatabasePool } from "@anc/database";

import type { StaffActor } from "../src/auth/staff-auth.types.js";
import {
  IdempotencyService,
  createIdempotencyRequestHash,
} from "../src/idempotency/idempotency.service.js";
import { apiConfigFixture } from "./fixtures.js";

const secret = "idempotency-test-secret-at-least-32-characters";

describe("idempotency request fingerprint", () => {
  it("is deterministic across object key order and sensitive-input safe at rest", () => {
    const first = createIdempotencyRequestHash(secret, {
      target_id: "420b7443-b87c-4728-bbf5-cbe6eff22c59",
      occurred_on: "2026-08-08",
    });
    const reordered = createIdempotencyRequestHash(secret, {
      occurred_on: "2026-08-08",
      target_id: "420b7443-b87c-4728-bbf5-cbe6eff22c59",
    });
    const changed = createIdempotencyRequestHash(secret, {
      occurred_on: "2026-08-09",
      target_id: "420b7443-b87c-4728-bbf5-cbe6eff22c59",
    });

    expect(first).toMatch(/^[a-f0-9]{64}$/);
    expect(reordered).toBe(first);
    expect(changed).not.toBe(first);
    expect(first).not.toContain("2026-08-08");
  });

  it("rejects non-JSON and circular request identities", () => {
    expect(() => createIdempotencyRequestHash(secret, { value: undefined })).toThrow(
      "only JSON values",
    );
    expect(() => createIdempotencyRequestHash(secret, Number.NaN)).toThrow("number");
    const circular: { self?: unknown } = {};
    circular.self = circular;
    expect(() => createIdempotencyRequestHash(secret, circular)).toThrow("circular");
  });

  it("maps request-hash conflicts to the canonical API conflict", async () => {
    const service = new IdempotencyService(conflictingPool(), apiConfigFixture());
    await expect(
      service.runForStaff(
        {
          actor: staffActor(),
          operation: "TEST_MUTATION",
          idempotencyKey: "8b26fdbd-6306-4bbf-9765-3fd620888e7c",
          requestIdentity: { target_id: "420b7443-b87c-4728-bbf5-cbe6eff22c59" },
        },
        () =>
          Promise.resolve({
            resourceType: "TEST_RESOURCE",
            resourceId: "420b7443-b87c-4728-bbf5-cbe6eff22c59",
            value: true,
          }),
        () => Promise.resolve(true),
      ),
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_KEY_REUSED" });
  });
});

function conflictingPool(): DatabasePool {
  const client = {
    query: (sql: string) => {
      const normalized = sql.replace(/\s+/gu, " ").trim();
      if (normalized.startsWith("SELECT request_hash")) {
        return Promise.resolve({
          rows: [
            {
              request_hash: "b".repeat(64),
              result_resource_type: "TEST_RESOURCE",
              result_resource_id: "420b7443-b87c-4728-bbf5-cbe6eff22c59",
              completed_at: new Date("2026-08-08T15:00:00.000Z"),
            },
          ],
          rowCount: 1,
        });
      }
      return Promise.resolve({ rows: [], rowCount: 0 });
    },
    release: () => undefined,
  };
  return {
    connect: () => Promise.resolve(client),
  } as unknown as DatabasePool;
}

function staffActor(): StaffActor {
  return {
    staffUserId: "0d5e8c8f-0f39-4b4e-87f5-30ac3c0c80bc",
    sessionId: "70000000-0000-4000-8000-000000000001",
    healthCenterId: "60000000-0000-4000-8000-000000000001",
    displayName: "Test Puskesmas",
    role: "PUSKESMAS",
    status: "ACTIVE",
    assignments: [],
  };
}
