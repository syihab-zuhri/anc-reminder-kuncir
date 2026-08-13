/* eslint-disable @typescript-eslint/require-await -- query double returns resolved values by SQL branch */
import type { DatabasePool } from "@anc/database";
import { describe, expect, it, vi } from "vitest";

import { processReminderCycles } from "../src/reminder-processor.js";

describe("reminder content snapshots (TASK-P4-009)", () => {
  it("selects published push and wa.me template versions when creating a cycle", async () => {
    const queries: Array<{ sql: string; params: unknown[] }> = [];
    const client = {
      query: vi.fn(async (sql: string, params: unknown[] = []) => {
        queries.push({ sql, params });
        if (sql.includes("FROM pregnancy_milestones pm")) {
          return {
            rows: [
              {
                milestone_id: "80000000-0000-4000-8000-000000000001",
                mother_id: "60000000-0000-4000-8000-000000000001",
                health_center_id: "30000000-0000-4000-8000-000000000001",
                due_at: "2026-08-13T00:00:00.000Z",
              },
            ],
            rowCount: 1,
          };
        }
        if (sql.includes("INSERT INTO reminder_cycles")) return { rows: [], rowCount: 1 };
        if (sql.includes("SELECT id FROM devices")) return { rows: [], rowCount: 0 };
        if (sql.includes("INSERT INTO wa_fallback_actions")) return { rows: [], rowCount: 1 };
        return { rows: [], rowCount: 0 };
      }),
      release: vi.fn(),
    };
    const pool = { connect: vi.fn(() => Promise.resolve(client)) } as unknown as DatabasePool;

    const result = await processReminderCycles(pool, "2026-08-13");

    expect(result).toEqual({
      createdCyclesCount: 1,
      pushAttemptsCount: 0,
      waFallbackActionsCount: 1,
    });
    const cycleInsert = queries.find((entry) => entry.sql.includes("INSERT INTO reminder_cycles"));
    const eligibilityQuery = queries.find((entry) =>
      entry.sql.includes("FROM pregnancy_milestones pm"),
    );
    expect(eligibilityQuery?.sql).toContain("JOIN LATERAL");
    expect(eligibilityQuery?.sql).toContain("ORDER BY recorded_at DESC, id DESC");
    expect(cycleInsert?.sql).toContain("push_template_version_id");
    expect(cycleInsert?.sql).toContain("ct.content_type = 'PUSH_REMINDER'");
    expect(cycleInsert?.params[4]).toBe("30000000-0000-4000-8000-000000000001");

    const fallbackInsert = queries.find((entry) =>
      entry.sql.includes("INSERT INTO wa_fallback_actions"),
    );
    expect(fallbackInsert?.sql).toContain("template_version_id");
    expect(fallbackInsert?.sql).toContain("ct.content_type = 'WAME_REMINDER'");
    expect(fallbackInsert?.params[3]).toBe("30000000-0000-4000-8000-000000000001");
    expect(client.release).toHaveBeenCalledOnce();
  });
});
