import { describe, expect, it } from "vitest";

import {
  milestoneDueDateMutationRequestSchema,
  milestoneDueDateMutationResponseSchema,
} from "../src/index.js";

describe("milestone schedule contracts", () => {
  it("requires a valid due date and an explicit expected schedule version", () => {
    expect(
      milestoneDueDateMutationRequestSchema.safeParse({
        idempotency_key: "10000000-0000-4000-8000-000000000001",
        due_date: "2026-08-12",
        expected_due_date: null,
      }).success,
    ).toBe(true);
    expect(
      milestoneDueDateMutationRequestSchema.safeParse({
        idempotency_key: "10000000-0000-4000-8000-000000000002",
        due_date: "2026-02-30",
        expected_due_date: null,
      }).success,
    ).toBe(false);
    expect(
      milestoneDueDateMutationRequestSchema.safeParse({
        idempotency_key: "10000000-0000-4000-8000-000000000003",
        due_date: "2026-08-12",
      }).success,
    ).toBe(false);
  });

  it("keeps schedule and reschedule response transitions internally consistent", () => {
    const base = {
      event_id: "20000000-0000-4000-8000-000000000001",
      pregnancy_id: "30000000-0000-4000-8000-000000000001",
      milestone_id: "40000000-0000-4000-8000-000000000001",
      code: "K2",
      due_date: "2026-08-12",
      due_at: "2026-08-11T17:00:00.000Z",
      timezone: "Asia/Jakarta",
      reason: null,
      occurred_at: "2026-08-11T09:00:00.000Z",
    } as const;

    expect(
      milestoneDueDateMutationResponseSchema.safeParse({
        ...base,
        action: "SCHEDULED",
        previous_due_date: null,
      }).success,
    ).toBe(true);
    expect(
      milestoneDueDateMutationResponseSchema.safeParse({
        ...base,
        action: "RESCHEDULED",
        previous_due_date: null,
      }).success,
    ).toBe(false);
  });
});
