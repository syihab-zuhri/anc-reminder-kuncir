import { describe, expect, it } from "vitest";

import {
  motherListQuerySchema,
  motherListResponseSchema,
  operationalMilestonesQuerySchema,
  operationalMilestonesResponseSchema,
} from "../src/index.js";

describe("operational query contracts", () => {
  it("validates mother list query parameters", () => {
    expect(motherListQuerySchema.safeParse({ limit: 20 }).success).toBe(true);
    expect(
      motherListQuerySchema.safeParse({
        search: "Siti",
        village_id: "10000000-0000-4000-8000-000000000001",
        pregnancy_status: "ACTIVE",
        limit: "10",
      }).success,
    ).toBe(true);
    expect(
      motherListQuerySchema.safeParse({
        limit: 500, // exceeds max 100
      }).success,
    ).toBe(false);
  });

  it("validates mother list response structure", () => {
    const validResponse = {
      items: [
        {
          id: "10000000-0000-4000-8000-000000000001",
          health_center_id: "20000000-0000-4000-8000-000000000001",
          full_name: "Siti Aminah",
          phone_masked: "0812****5678",
          address: "Jl. Kuncir No. 1",
          village_id: "30000000-0000-4000-8000-000000000001",
          village_name: "Desa Kuncir",
          created_at: "2026-08-12T10:00:00.000Z",
          active_pregnancy: {
            id: "40000000-0000-4000-8000-000000000001",
            dating_date: "2026-05-01",
            status: "ACTIVE",
            completed_weeks: 14,
            completed_days: 5,
            trimester_label: "Trimester 2",
          },
        },
      ],
      next_cursor: null,
      has_more: false,
    };
    expect(motherListResponseSchema.safeParse(validResponse).success).toBe(true);
  });

  it("validates operational milestones query and response", () => {
    const query = {
      status: "DUE",
      milestone_code: "K2",
      due_date_from: "2026-08-01",
      due_date_to: "2026-08-31",
      limit: "15",
    };
    expect(operationalMilestonesQuerySchema.safeParse(query).success).toBe(true);

    const validResponse = {
      items: [
        {
          milestone_id: "50000000-0000-4000-8000-000000000001",
          pregnancy_id: "40000000-0000-4000-8000-000000000001",
          mother_id: "10000000-0000-4000-8000-000000000001",
          mother_full_name: "Siti Aminah",
          mother_phone_masked: "0812****5678",
          village_id: "30000000-0000-4000-8000-000000000001",
          village_name: "Desa Kuncir",
          milestone_code: "K2",
          visit_status: "DUE",
          record_validation_status: "INCOMPLETE",
          due_at: "2026-08-15",
          expected_due_date: "2026-08-15",
          occurred_on: null,
          completed_weeks: 14,
          completed_days: 5,
          trimester_label: "Trimester 2",
        },
      ],
      next_cursor: null,
      has_more: false,
    };
    expect(operationalMilestonesResponseSchema.safeParse(validResponse).success).toBe(true);
  });
});
