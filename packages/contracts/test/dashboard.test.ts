import { describe, expect, it } from "vitest";

import {
  bidanDashboardResponseSchema,
  bumilDashboardResponseSchema,
  puskesmasDashboardResponseSchema,
} from "../src/dashboard.js";

describe("Dashboard contracts", () => {
  it("validates Puskesmas dashboard schema", () => {
    const valid = {
      summary: {
        total_active_pregnancies: 42,
        milestones_due_count: 5,
        milestones_overdue_count: 2,
        pending_validations_count: 3,
        unresolved_wa_fallbacks_count: 1,
      },
      priority_action_queue: [
        {
          mother_id: "60000000-0000-4000-8000-000000000001",
          mother_full_name: "Siti Aminah",
          village_name: "Desa Kuncir",
          milestone_code: "K2",
          visit_status: "DUE",
          due_at: "2026-08-15",
          action_type: "CONFIRMATION_NEEDED",
        },
      ],
    };

    const parsed = puskesmasDashboardResponseSchema.parse(valid);
    expect(parsed.summary.total_active_pregnancies).toBe(42);
    expect(parsed.priority_action_queue).toHaveLength(1);
  });

  it("validates Bidan dashboard schema", () => {
    const valid = {
      summary: {
        assigned_mothers_count: 15,
        milestones_due_count: 2,
        milestones_overdue_count: 1,
        action_required_count: 3,
      },
      assigned_villages: [
        {
          village_id: "50000000-0000-4000-8000-000000000001",
          village_name: "Desa Kuncir",
        },
      ],
      confirmation_queue: [
        {
          mother_id: "60000000-0000-4000-8000-000000000001",
          mother_full_name: "Siti Aminah",
          mother_phone_masked: "0812****5678",
          village_name: "Desa Kuncir",
          milestone_code: "K2",
          visit_status: "DUE",
          due_at: "2026-08-15",
        },
      ],
    };

    const parsed = bidanDashboardResponseSchema.parse(valid);
    expect(parsed.summary.assigned_mothers_count).toBe(15);
    expect(parsed.assigned_villages).toHaveLength(1);
  });

  it("validates Bumil dashboard schema", () => {
    const valid = {
      mother_info: {
        full_name: "Siti Aminah",
        address: "Jl. Kuncir No. 1",
        village_name: "Desa Kuncir",
      },
      active_pregnancy: {
        id: "70000000-0000-4000-8000-000000000001",
        dating_date: "2026-05-01",
        completed_weeks: 14,
        completed_days: 5,
        trimester_label: "Trimester 2",
        status: "ACTIVE",
      },
      next_milestone: {
        milestone_code: "K2",
        visit_status: "DUE",
        due_at: "2026-08-15",
        expected_due_date: "2026-08-15",
        recommended_facility_name: "Puskesmas Kuncir",
      },
      milestones: [
        {
          milestone_code: "K1",
          visit_status: "CONFIRMED",
          record_validation_status: "VALIDATED",
          due_at: "2026-06-01",
          occurred_on: "2026-05-28",
        },
      ],
    };

    const parsed = bumilDashboardResponseSchema.parse(valid);
    expect(parsed.mother_info.full_name).toBe("Siti Aminah");
    expect(parsed.active_pregnancy?.completed_weeks).toBe(14);
  });
});
