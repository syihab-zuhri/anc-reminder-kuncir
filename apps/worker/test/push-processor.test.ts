/* eslint-disable @typescript-eslint/require-await -- SQL doubles intentionally return resolved values */
import { DeviceTokenCrypto, type DatabasePool } from "@anc/database";
import { describe, expect, it, vi } from "vitest";

import type { PushDeliveryAdapter, PushDeliveryResult } from "../src/push-adapter.js";
import { processPendingPushAttempts } from "../src/push-processor.js";

const now = new Date("2026-08-13T03:00:00.000Z");
const tokenCrypto = new DeviceTokenCrypto(Buffer.from("p".repeat(32)).toString("base64"));
const plaintextToken = "synthetic-fcm-token:abc1234567890";

describe("push attempt processor", () => {
  it("leases, renders, delivers, and closes a successful push cycle", async () => {
    const fixture = poolFixture(jobRow());
    const send = vi.fn(() =>
      Promise.resolve<PushDeliveryResult>({
        status: "SUCCESS",
        providerMessageId: "projects/test/messages/message-1",
      }),
    );

    const result = await processPendingPushAttempts(
      fixture.pool,
      { send },
      tokenCrypto,
      { maxAttempts: 3, backoffSeconds: [60, 300, 900] },
      { now, random: () => 0 },
    );

    expect(result).toEqual({
      processedAttemptsCount: 1,
      succeededCount: 1,
      retriesScheduledCount: 0,
      terminalFailuresCount: 0,
      waFallbackActionsCount: 0,
    });
    expect(send).toHaveBeenCalledWith({
      token: plaintextToken,
      title: "Pengingat K2",
      body: "Silakan datang ke Puskesmas Sintetis.",
      reminderCycleId: "90000000-0000-4000-8000-000000000001",
      milestoneCode: "K2",
    });
    expect(fixture.statements.some(({ sql }) => sql.includes("status = 'PUSH_SUCCEEDED'"))).toBe(
      true,
    );
    expect(JSON.stringify(fixture.statements)).not.toContain(plaintextToken);
  });

  it("schedules a leased retry using the greater provider backoff", async () => {
    const fixture = poolFixture(jobRow());
    const adapter = fixedAdapter({
      status: "RETRYABLE_FAILURE",
      errorCode: "UNAVAILABLE",
      retryAfterSeconds: 120,
      invalidateDevice: false,
    });

    const result = await processPendingPushAttempts(
      fixture.pool,
      adapter,
      tokenCrypto,
      { maxAttempts: 3, backoffSeconds: [60, 300, 900] },
      { now, random: () => 0 },
    );

    expect(result.retriesScheduledCount).toBe(1);
    const retryInsert = fixture.statements.find(({ sql }) =>
      sql.includes("INSERT INTO push_attempts"),
    );
    expect(retryInsert?.params[2]).toBe(2);
    expect(retryInsert?.params[3]).toEqual(now);
    expect(retryInsert?.params[4]).toEqual(new Date("2026-08-13T03:02:00.000Z"));
    expect(fixture.statements.some(({ sql }) => sql.includes("wa_fallback_actions"))).toBe(false);
  });

  it("invalidates an unregistered device and creates manual fallback after terminal failure", async () => {
    const fixture = poolFixture(jobRow({ attempt_no: 3 }));
    const adapter = fixedAdapter({
      status: "TERMINAL_FAILURE",
      errorCode: "UNREGISTERED",
      invalidateDevice: true,
    });

    const result = await processPendingPushAttempts(
      fixture.pool,
      adapter,
      tokenCrypto,
      { maxAttempts: 3, backoffSeconds: [60, 300, 900] },
      { now, random: () => 0 },
    );

    expect(result).toMatchObject({ terminalFailuresCount: 1, waFallbackActionsCount: 1 });
    expect(
      fixture.statements.some(
        ({ sql }) => sql.includes("UPDATE devices") && sql.includes("'INVALID'"),
      ),
    ).toBe(true);
    expect(
      fixture.statements.some(
        ({ sql }) => sql.includes("wa_fallback_actions") && sql.includes("WAME_REMINDER"),
      ),
    ).toBe(true);
    expect(
      fixture.statements.some(({ sql }) => sql.includes("status = 'WA_ACTION_REQUIRED'")),
    ).toBe(true);
  });

  it("creates fallback without calling FCM when the active device disappeared", async () => {
    const fixture = poolFixture(jobRow({ device_id: null, push_token_encrypted: null }));
    const send = vi.fn(() =>
      Promise.resolve<PushDeliveryResult>({
        status: "SUCCESS",
        providerMessageId: "must-not-be-called",
      }),
    );

    const result = await processPendingPushAttempts(
      fixture.pool,
      { send },
      tokenCrypto,
      { maxAttempts: 3, backoffSeconds: [60] },
      { now, random: () => 0 },
    );

    expect(send).not.toHaveBeenCalled();
    expect(result.waFallbackActionsCount).toBe(1);
  });
});

function fixedAdapter(result: PushDeliveryResult): PushDeliveryAdapter {
  return { send: vi.fn(() => Promise.resolve(result)) };
}

function jobRow(
  overrides: Partial<ReturnType<typeof baseJobRow>> = {},
): ReturnType<typeof baseJobRow> {
  return { ...baseJobRow(), ...overrides };
}

function baseJobRow() {
  return {
    attempt_id: "a0000000-0000-4000-8000-000000000001",
    reminder_cycle_id: "90000000-0000-4000-8000-000000000001",
    attempt_no: 1,
    device_id: "d0000000-0000-4000-8000-000000000001" as string | null,
    push_token_encrypted: tokenCrypto.encrypt(plaintextToken) as string | null,
    title: "Pengingat {{milestone_code}}" as string | null,
    body: "Silakan datang ke {{facility_name}}." as string | null,
    milestone_code: "K2",
    facility_name: "Puskesmas Sintetis",
    mother_id: "60000000-0000-4000-8000-000000000001",
    health_center_id: "30000000-0000-4000-8000-000000000001",
  };
}

function poolFixture(claimedJob: ReturnType<typeof baseJobRow>): {
  readonly pool: DatabasePool;
  readonly statements: Array<{ readonly sql: string; readonly params: readonly unknown[] }>;
} {
  let claimReturned = false;
  const statements: Array<{ readonly sql: string; readonly params: readonly unknown[] }> = [];
  const client = {
    query: vi.fn(async (sql: string, params: readonly unknown[] = []) => {
      statements.push({ sql, params });
      return { rows: [], rowCount: sql.includes("INSERT INTO wa_fallback_actions") ? 1 : 1 };
    }),
    release: vi.fn(),
  };
  const pool = {
    query: vi.fn(async (sql: string, params: readonly unknown[] = []) => {
      statements.push({ sql, params });
      if (!claimReturned) {
        claimReturned = true;
        return { rows: [claimedJob], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    }),
    connect: vi.fn(() => Promise.resolve(client)),
  } as unknown as DatabasePool;
  return { pool, statements };
}
