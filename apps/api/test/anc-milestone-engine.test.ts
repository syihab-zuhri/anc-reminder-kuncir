import type { AncPlanRuleResponse, MilestoneCode } from "@anc/contracts";
import type { TransactionClient } from "@anc/database";
import { describe, expect, it, vi } from "vitest";

import {
  ActiveAncPlanUnavailableError,
  initializePregnancyMilestones,
  resolveAssignableAncPlan,
  type AssignableAncPlan,
} from "../src/anc-plan/anc-milestone-engine.js";

const planId = "30000000-0000-4000-8000-000000000001";
const pregnancyId = "60000000-0000-4000-8000-000000000001";

describe("ANC milestone engine", () => {
  it("rejects a synthetic draft when production selection is requested", async () => {
    const client = planQueryClient();
    await expect(resolveAssignableAncPlan(client, false)).rejects.toBeInstanceOf(
      ActiveAncPlanUnavailableError,
    );
  });

  it("selects a complete synthetic draft only when lower-environment use is explicit", async () => {
    const plan = await resolveAssignableAncPlan(planQueryClient(), true);
    expect(plan).toMatchObject({
      id: planId,
      planKind: "SYNTHETIC",
      productionEligible: false,
    });
    expect(plan.rules.map((rule) => rule.code)).toEqual([
      "K1",
      "K2",
      "K3",
      "K4",
      "K5",
      "K6",
      "K7",
      "K8",
    ]);
  });

  it("initializes K1-K8 atomically without inventing due dates", async () => {
    const inserted: readonly unknown[][] = [];
    const mutableInserted = inserted as unknown[][];
    const query = vi.fn((_statement: string, values?: readonly unknown[]) => {
      mutableInserted.push([...(values ?? [])]);
      return { rowCount: 1, rows: [] };
    });
    const client = { query } as unknown as TransactionClient;
    await initializePregnancyMilestones(client, pregnancyId, assignablePlan());

    expect(query).toHaveBeenCalledTimes(8);
    expect(mutableInserted.map((values) => values[4])).toEqual([
      "K1",
      "K2",
      "K3",
      "K4",
      "K5",
      "K6",
      "K7",
      "K8",
    ]);
    expect(mutableInserted.map((values) => values[5])).toEqual([
      "INCOMPLETE",
      "INCOMPLETE",
      "INCOMPLETE",
      "INCOMPLETE",
      "INCOMPLETE",
      "INCOMPLETE",
      "NOT_REQUIRED",
      "NOT_REQUIRED",
    ]);
  });
});

function planQueryClient(): TransactionClient {
  const query = vi.fn((statement: string, values?: readonly unknown[]) => {
    if (statement.includes("FROM anc_plan_versions")) {
      if (values?.[0] !== true) return { rowCount: 0, rows: [] };
      return {
        rowCount: 1,
        rows: [
          {
            id: planId,
            version_no: 1,
            plan_kind: "SYNTHETIC",
            status: "DRAFT",
            source_reference: "SYNTHETIC ENGINE FIXTURE - NOT CLINICAL GUIDANCE",
          },
        ],
      };
    }
    if (statement.includes("FROM anc_milestone_rules")) {
      return { rowCount: 8, rows: rules() };
    }
    throw new Error("Unexpected fake query");
  });
  return { query } as unknown as TransactionClient;
}

function assignablePlan(): AssignableAncPlan {
  return {
    id: planId,
    versionNo: 1,
    planKind: "SYNTHETIC",
    productionEligible: false,
    rules: rules(),
  };
}

function rules(): AncPlanRuleResponse[] {
  return (["K1", "K2", "K3", "K4", "K5", "K6", "K7", "K8"] as const).map((code, index) =>
    rule(code, index),
  );
}

function rule(code: MilestoneCode, index: number): AncPlanRuleResponse {
  const base = {
    id: `31000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    plan_version_id: planId,
    code,
    trimester_label: "SYNTHETIC_DEV_ONLY",
    reminder_interval_days: 3 as const,
  };
  if (code === "K8") {
    return {
      ...base,
      target_week_start: null,
      target_week_end: null,
      milestone_category: "DELIVERY",
      required_facility_policy: "PONED_OR_RS_REQUIRED",
      allowed_facility_types: ["PONED", "HOSPITAL"],
      reminder_enabled: false,
    };
  }
  const puskesmasRequired = code === "K1" || code === "K4" || code === "K5";
  return {
    ...base,
    target_week_start: index + 1,
    target_week_end: index + 1,
    milestone_category: "ANC",
    required_facility_policy: puskesmasRequired ? "PUSKESMAS_REQUIRED" : "FLEXIBLE",
    allowed_facility_types: puskesmasRequired ? ["PUSKESMAS"] : ["PUSKESMAS", "MIDWIFE_PRACTICE"],
    reminder_enabled: true,
  };
}
