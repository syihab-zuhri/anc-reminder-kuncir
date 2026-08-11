import { describe, expect, it } from "vitest";

import { visitConfirmationRequestSchema, visitConfirmationResponseSchema } from "../src/index.js";

describe("visit confirmation contracts", () => {
  it("accepts only the minimal confirm-only request", () => {
    const request = {
      idempotency_key: "10000000-0000-4000-8000-000000000001",
      occurred_on: "2026-08-11",
      facility_id: "20000000-0000-4000-8000-000000000001",
    };

    expect(visitConfirmationRequestSchema.safeParse(request).success).toBe(true);
    expect(
      visitConfirmationRequestSchema.safeParse({
        ...request,
        clinical_detail: "must never be accepted by confirm-only",
      }).success,
    ).toBe(false);
    expect(
      visitConfirmationRequestSchema.safeParse({ ...request, occurred_on: "2026-02-30" }).success,
    ).toBe(false);
  });

  it("returns a server-controlled source and keeps validation state independent", () => {
    expect(
      visitConfirmationResponseSchema.safeParse({
        id: "30000000-0000-4000-8000-000000000001",
        milestone_id: "40000000-0000-4000-8000-000000000001",
        pregnancy_id: "50000000-0000-4000-8000-000000000001",
        code: "K3",
        visit_status: "CONFIRMED",
        record_validation_status: "INCOMPLETE",
        occurred_on: "2026-08-11",
        facility_id: "20000000-0000-4000-8000-000000000001",
        confirmation_source: "STAFF_WEB",
        confirmed_by_staff_id: "60000000-0000-4000-8000-000000000001",
        confirmed_at: "2026-08-11T09:00:00.000Z",
      }).success,
    ).toBe(true);
  });
});
