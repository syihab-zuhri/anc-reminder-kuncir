import { z } from "zod";

import {
  ancPlanKindSchema,
  milestoneCategorySchema,
  milestoneCodeSchema,
  recordValidationStatusSchema,
  requiredFacilityPolicySchema,
  ruleVersionStatusSchema,
  visitStatusSchema,
} from "./domain.js";
import { idempotencyKeySchema } from "./idempotency.js";
import { facilityTypeSchema } from "./organization.js";

const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/u, "Expected date in YYYY-MM-DD format")
  .refine(isCalendarDate, "Expected a valid calendar date");

const nullableWeekSchema = z.number().int().min(0).nullable();

export const ancPlanRuleInputSchema = z
  .object({
    code: milestoneCodeSchema,
    trimester_label: z.string().trim().min(1).max(80),
    target_week_start: nullableWeekSchema,
    target_week_end: nullableWeekSchema,
    milestone_category: milestoneCategorySchema,
    required_facility_policy: requiredFacilityPolicySchema,
    allowed_facility_types: z
      .array(facilityTypeSchema)
      .min(1)
      .max(facilityTypeSchema.options.length)
      .refine((values) => new Set(values).size === values.length, "Facility types must be unique"),
    reminder_enabled: z.boolean(),
  })
  .strict()
  .superRefine((rule, context) => {
    const hasBothWeeks = rule.target_week_start !== null && rule.target_week_end !== null;
    const hasNeitherWeek = rule.target_week_start === null && rule.target_week_end === null;
    if (!hasBothWeeks && !hasNeitherWeek) {
      context.addIssue({
        code: "custom",
        path: ["target_week_end"],
        message: "Target week start and end must both be set or both be null",
      });
    }
    if (
      rule.target_week_start !== null &&
      rule.target_week_end !== null &&
      rule.target_week_end < rule.target_week_start
    ) {
      context.addIssue({
        code: "custom",
        path: ["target_week_end"],
        message: "Target week end must not precede target week start",
      });
    }
    validateStructuralRule(rule, context);
  });
export type AncPlanRuleInput = z.infer<typeof ancPlanRuleInputSchema>;

export const ancPlanCreateRequestSchema = z
  .object({
    idempotency_key: idempotencyKeySchema,
    source_reference: z.string().trim().min(3).max(240),
    rules: z.array(ancPlanRuleInputSchema).length(milestoneCodeSchema.options.length),
  })
  .strict()
  .superRefine((request, context) => {
    const codes = request.rules.map((rule) => rule.code);
    for (const requiredCode of milestoneCodeSchema.options) {
      if (!codes.includes(requiredCode)) {
        context.addIssue({
          code: "custom",
          path: ["rules"],
          message: `Missing milestone rule ${requiredCode}`,
        });
      }
    }
    if (new Set(codes).size !== codes.length) {
      context.addIssue({
        code: "custom",
        path: ["rules"],
        message: "Milestone codes must be unique",
      });
    }
  });
export type AncPlanCreateRequest = z.infer<typeof ancPlanCreateRequestSchema>;

export const ancPlanApproveRequestSchema = z
  .object({
    idempotency_key: idempotencyKeySchema,
    approval_reference: z.string().trim().min(3).max(240),
    effective_from: isoDateSchema,
  })
  .strict();
export type AncPlanApproveRequest = z.infer<typeof ancPlanApproveRequestSchema>;

export const ancPlanActivateRequestSchema = z
  .object({ idempotency_key: idempotencyKeySchema })
  .strict();
export type AncPlanActivateRequest = z.infer<typeof ancPlanActivateRequestSchema>;

export const ancPlanRuleResponseSchema = ancPlanRuleInputSchema.extend({
  id: z.string().uuid(),
  plan_version_id: z.string().uuid(),
  reminder_interval_days: z.literal(3),
});
export type AncPlanRuleResponse = z.infer<typeof ancPlanRuleResponseSchema>;

export const ancPlanResponseSchema = z
  .object({
    id: z.string().uuid(),
    version_no: z.number().int().positive(),
    plan_kind: ancPlanKindSchema,
    status: ruleVersionStatusSchema,
    source_reference: z.string().min(1),
    approval_reference: z.string().min(1).nullable(),
    effective_from: isoDateSchema.nullable(),
    approved_by_staff_id: z.string().uuid().nullable(),
    approved_at: z.string().datetime({ offset: true }).nullable(),
    activated_at: z.string().datetime({ offset: true }).nullable(),
    production_eligible: z.boolean(),
    rules: z.array(ancPlanRuleResponseSchema).length(milestoneCodeSchema.options.length),
  })
  .strict()
  .superRefine((plan, context) => {
    const expectedProductionEligibility = plan.plan_kind === "CLINICAL" && plan.status === "ACTIVE";
    if (plan.production_eligible !== expectedProductionEligibility) {
      context.addIssue({
        code: "custom",
        path: ["production_eligible"],
        message: "production_eligible must match a CLINICAL ACTIVE plan",
      });
    }
    if (plan.plan_kind === "SYNTHETIC" && plan.status !== "DRAFT") {
      context.addIssue({
        code: "custom",
        path: ["status"],
        message: "Synthetic ANC plans must remain DRAFT",
      });
    }
  });
export type AncPlanResponse = z.infer<typeof ancPlanResponseSchema>;

export const pregnancyMilestoneResponseSchema = z
  .object({
    id: z.string().uuid(),
    pregnancy_id: z.string().uuid(),
    rule_id: z.string().uuid(),
    code: milestoneCodeSchema,
    trimester_label: z.string().min(1),
    target_week_start: nullableWeekSchema,
    target_week_end: nullableWeekSchema,
    milestone_category: milestoneCategorySchema,
    required_facility_policy: requiredFacilityPolicySchema,
    allowed_facility_types: z.array(facilityTypeSchema).min(1),
    reminder_enabled: z.boolean(),
    reminder_interval_days: z.literal(3),
    due_at: z.string().datetime({ offset: true }).nullable(),
    visit_status: visitStatusSchema,
    record_validation_status: recordValidationStatusSchema,
  })
  .strict();
export type PregnancyMilestoneResponse = z.infer<typeof pregnancyMilestoneResponseSchema>;

export const pregnancyMilestoneListResponseSchema = z
  .object({
    pregnancy_id: z.string().uuid(),
    care_plan_version_id: z.string().uuid(),
    plan_version_no: z.number().int().positive(),
    plan_kind: ancPlanKindSchema,
    production_eligible: z.boolean(),
    milestones: z
      .array(pregnancyMilestoneResponseSchema)
      .length(milestoneCodeSchema.options.length),
  })
  .strict();
export type PregnancyMilestoneListResponse = z.infer<typeof pregnancyMilestoneListResponseSchema>;

function validateStructuralRule(rule: AncPlanRuleInput, context: z.RefinementCtx): void {
  const puskesmasRequired = new Set(["K1", "K4", "K5"]);
  const flexible = new Set(["K2", "K3", "K6", "K7"]);

  if (rule.code === "K8") {
    if (
      rule.milestone_category !== "DELIVERY" ||
      rule.required_facility_policy !== "PONED_OR_RS_REQUIRED"
    ) {
      context.addIssue({
        code: "custom",
        path: ["required_facility_policy"],
        message: "K8 must be a DELIVERY milestone with PONED_OR_RS_REQUIRED policy",
      });
    }
    if (
      rule.allowed_facility_types.some(
        (facilityType) => facilityType !== "PONED" && facilityType !== "HOSPITAL",
      )
    ) {
      context.addIssue({
        code: "custom",
        path: ["allowed_facility_types"],
        message: "K8 may only allow PONED or HOSPITAL facility types",
      });
    }
    return;
  }

  if (rule.milestone_category !== "ANC") {
    context.addIssue({
      code: "custom",
      path: ["milestone_category"],
      message: `${rule.code} must use ANC milestone category`,
    });
  }

  if (puskesmasRequired.has(rule.code)) {
    if (
      rule.required_facility_policy !== "PUSKESMAS_REQUIRED" ||
      rule.allowed_facility_types.length !== 1 ||
      rule.allowed_facility_types[0] !== "PUSKESMAS"
    ) {
      context.addIssue({
        code: "custom",
        path: ["allowed_facility_types"],
        message: `${rule.code} must allow only PUSKESMAS`,
      });
    }
  } else if (flexible.has(rule.code) && rule.required_facility_policy !== "FLEXIBLE") {
    context.addIssue({
      code: "custom",
      path: ["required_facility_policy"],
      message: `${rule.code} must use FLEXIBLE facility policy`,
    });
  }
}

function isCalendarDate(value: string): boolean {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}
