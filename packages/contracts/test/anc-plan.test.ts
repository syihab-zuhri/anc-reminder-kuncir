import { describe, expect, it } from "vitest";

import {
  ancPlanCreateRequestSchema,
  ancPlanResponseSchema,
  milestoneCodeSchema,
  type AncPlanRuleInput,
  type MilestoneCode,
} from "../src/index.js";

describe("ANC plan contracts", () => {
  it("accepts exactly one structurally valid rule for K1 through K8", () => {
    const parsed = ancPlanCreateRequestSchema.parse({
      idempotency_key: "10000000-0000-4000-8000-000000000001",
      source_reference: "SYNTHETIC CONTRACT FIXTURE - NOT CLINICAL GUIDANCE",
      rules: milestoneCodeSchema.options.map(ruleFor),
    });

    expect(parsed.rules.map((rule) => rule.code)).toEqual(milestoneCodeSchema.options);
  });

  it("rejects duplicate codes and structural facility-policy violations", () => {
    const duplicateRules = milestoneCodeSchema.options.map(ruleFor);
    duplicateRules[7] = ruleFor("K7");
    expect(
      ancPlanCreateRequestSchema.safeParse({
        idempotency_key: "10000000-0000-4000-8000-000000000002",
        source_reference: "SYNTHETIC CONTRACT FIXTURE - NOT CLINICAL GUIDANCE",
        rules: duplicateRules,
      }).success,
    ).toBe(false);

    const invalidK1 = {
      ...ruleFor("K1"),
      required_facility_policy: "FLEXIBLE",
      allowed_facility_types: ["MIDWIFE_PRACTICE"],
    };
    expect(
      ancPlanCreateRequestSchema.safeParse({
        idempotency_key: "10000000-0000-4000-8000-000000000003",
        source_reference: "SYNTHETIC CONTRACT FIXTURE - NOT CLINICAL GUIDANCE",
        rules: milestoneCodeSchema.options.map((code) =>
          code === "K1" ? invalidK1 : ruleFor(code),
        ),
      }).success,
    ).toBe(false);
  });

  it("never represents a synthetic plan as production eligible", () => {
    const rules = milestoneCodeSchema.options.map((code, index) => ({
      id: `20000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
      plan_version_id: "30000000-0000-4000-8000-000000000001",
      reminder_interval_days: 3,
      ...ruleFor(code),
    }));
    expect(
      ancPlanResponseSchema.safeParse({
        id: "30000000-0000-4000-8000-000000000001",
        version_no: 1,
        plan_kind: "SYNTHETIC",
        status: "ACTIVE",
        source_reference: "SYNTHETIC CONTRACT FIXTURE - NOT CLINICAL GUIDANCE",
        approval_reference: null,
        effective_from: null,
        approved_by_staff_id: null,
        approved_at: null,
        activated_at: null,
        production_eligible: true,
        rules,
      }).success,
    ).toBe(false);
  });
});

function ruleFor(code: MilestoneCode): AncPlanRuleInput {
  if (code === "K8") {
    return {
      code,
      trimester_label: "SYNTHETIC_DEV_ONLY",
      target_week_start: null,
      target_week_end: null,
      milestone_category: "DELIVERY",
      required_facility_policy: "PONED_OR_RS_REQUIRED",
      allowed_facility_types: ["PONED", "HOSPITAL"],
      reminder_enabled: false,
    };
  }
  const position = Number(code.slice(1));
  if (code === "K1" || code === "K4" || code === "K5") {
    return {
      code,
      trimester_label: "SYNTHETIC_DEV_ONLY",
      target_week_start: position,
      target_week_end: position,
      milestone_category: "ANC",
      required_facility_policy: "PUSKESMAS_REQUIRED",
      allowed_facility_types: ["PUSKESMAS"],
      reminder_enabled: true,
    };
  }
  return {
    code,
    trimester_label: "SYNTHETIC_DEV_ONLY",
    target_week_start: position,
    target_week_end: position,
    milestone_category: "ANC",
    required_facility_policy: "FLEXIBLE",
    allowed_facility_types: ["PUSKESMAS", "MIDWIFE_PRACTICE"],
    reminder_enabled: true,
  };
}
