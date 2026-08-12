import { z } from "zod";

import {
  assessmentEvaluatorTypeSchema,
  fetalRightsStatusSchema,
  ruleVersionStatusSchema,
  sigiziKesgaRecordingStatusSchema,
} from "./domain.js";
import { idempotencyKeySchema } from "./idempotency.js";

const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/u, "Expected date in YYYY-MM-DD format")
  .refine(isCalendarDate, "Expected a valid calendar date");

// Program evidence only covers Puskesmas-managed K1-K6 records.
export const programEvidenceMilestoneCodeSchema = z.enum(["K1", "K2", "K3", "K4", "K5", "K6"]);
export type ProgramEvidenceMilestoneCode = z.infer<typeof programEvidenceMilestoneCodeSchema>;

// OTHER_APPROVED is reserved for manually attested requirements and cannot be
// evaluated by the server, so it is not accepted as automated rule input.
export const programAutomatedRequirementTypeSchema = z.enum([
  "MILESTONE_VALIDATED",
  "FIELD_PRESENT",
]);
export type ProgramAutomatedRequirementType = z.infer<typeof programAutomatedRequirementTypeSchema>;

const fieldKeySchema = z
  .string()
  .regex(/^[A-Za-z0-9][A-Za-z0-9 _./:-]{0,127}$/u, "Field key must use the safe key grammar");

export const programRuleRequirementInputSchema = z
  .object({
    requirement_type: programAutomatedRequirementTypeSchema,
    milestone_code: programEvidenceMilestoneCodeSchema,
    field_key: fieldKeySchema.optional(),
  })
  .strict()
  .superRefine((requirement, context) => {
    if (requirement.requirement_type === "FIELD_PRESENT" && requirement.field_key === undefined) {
      context.addIssue({
        code: "custom",
        path: ["field_key"],
        message: "FIELD_PRESENT requirements must name the record field to check",
      });
    }
    if (
      requirement.requirement_type === "MILESTONE_VALIDATED" &&
      requirement.field_key !== undefined
    ) {
      context.addIssue({
        code: "custom",
        path: ["field_key"],
        message: "MILESTONE_VALIDATED requirements must not carry a field key",
      });
    }
  });
export type ProgramRuleRequirementInput = z.infer<typeof programRuleRequirementInputSchema>;

export const programRuleVersionCreateRequestSchema = z
  .object({
    idempotency_key: idempotencyKeySchema,
    source_reference: z.string().trim().min(3).max(240),
    requirements: z.array(programRuleRequirementInputSchema).min(1).max(12),
  })
  .strict()
  .superRefine((request, context) => {
    const seen = new Set<string>();
    for (const requirement of request.requirements) {
      const identity = `${requirement.requirement_type}:${requirement.milestone_code}:${requirement.field_key ?? ""}`;
      if (seen.has(identity)) {
        context.addIssue({
          code: "custom",
          path: ["requirements"],
          message: "Requirements must be unique per type, milestone, and field",
        });
        return;
      }
      seen.add(identity);
    }
  });
export type ProgramRuleVersionCreateRequest = z.infer<typeof programRuleVersionCreateRequestSchema>;

export const programRuleVersionApproveRequestSchema = z
  .object({
    idempotency_key: idempotencyKeySchema,
    approval_reference: z.string().trim().min(3).max(240),
    effective_from: isoDateSchema,
  })
  .strict();
export type ProgramRuleVersionApproveRequest = z.infer<
  typeof programRuleVersionApproveRequestSchema
>;

export const programRuleVersionActivateRequestSchema = z
  .object({ idempotency_key: idempotencyKeySchema })
  .strict();
export type ProgramRuleVersionActivateRequest = z.infer<
  typeof programRuleVersionActivateRequestSchema
>;

export const programAssessmentRecalculateRequestSchema = z
  .object({
    idempotency_key: idempotencyKeySchema,
    reason: z.string().trim().min(3).max(500).optional(),
  })
  .strict();
export type ProgramAssessmentRecalculateRequest = z.infer<
  typeof programAssessmentRecalculateRequestSchema
>;

export const programRuleRequirementResponseSchema = z
  .object({
    id: z.string().uuid(),
    program_rule_version_id: z.string().uuid(),
    requirement_type: programAutomatedRequirementTypeSchema,
    milestone_code: programEvidenceMilestoneCodeSchema,
    field_key: fieldKeySchema.nullable(),
  })
  .strict();
export type ProgramRuleRequirementResponse = z.infer<typeof programRuleRequirementResponseSchema>;

export const programRuleVersionResponseSchema = z
  .object({
    id: z.string().uuid(),
    version_no: z.number().int().positive(),
    status: ruleVersionStatusSchema,
    source_reference: z.string().min(1),
    approval_reference: z.string().min(1).nullable(),
    effective_from: isoDateSchema.nullable(),
    approved_by_staff_id: z.string().uuid().nullable(),
    approved_at: z.string().datetime({ offset: true }).nullable(),
    activated_at: z.string().datetime({ offset: true }).nullable(),
    production_eligible: z.boolean(),
    requirements: z.array(programRuleRequirementResponseSchema).min(1),
  })
  .strict()
  .superRefine((rule, context) => {
    if (rule.production_eligible !== (rule.status === "ACTIVE")) {
      context.addIssue({
        code: "custom",
        path: ["production_eligible"],
        message: "production_eligible must match an ACTIVE program rule",
      });
    }
  });
export type ProgramRuleVersionResponse = z.infer<typeof programRuleVersionResponseSchema>;

export const programStatusFieldCheckSchema = z
  .object({
    milestone_code: programEvidenceMilestoneCodeSchema,
    field_key: fieldKeySchema,
    present: z.boolean(),
  })
  .strict();
export type ProgramStatusFieldCheck = z.infer<typeof programStatusFieldCheckSchema>;

export const programStatusEvidenceSchema = z
  .object({
    required_milestones: z.array(programEvidenceMilestoneCodeSchema),
    validated_milestones: z.array(programEvidenceMilestoneCodeSchema),
    missing_milestones: z.array(programEvidenceMilestoneCodeSchema),
    field_checks: z.array(programStatusFieldCheckSchema),
  })
  .strict();
export type ProgramStatusEvidence = z.infer<typeof programStatusEvidenceSchema>;

export const programStatusResponseSchema = z
  .object({
    pregnancy_id: z.string().uuid(),
    rule_version_id: z.string().uuid().nullable(),
    rule_version_no: z.number().int().positive().nullable(),
    rule_status: ruleVersionStatusSchema.nullable(),
    sigizi_kesga_recording_status: sigiziKesgaRecordingStatusSchema,
    fetal_rights_status: fetalRightsStatusSchema,
    evidence: programStatusEvidenceSchema.nullable(),
    evaluated_at: z.string().datetime({ offset: true }).nullable(),
    evaluated_by_type: assessmentEvaluatorTypeSchema.nullable(),
    evaluated_by_staff_id: z.string().uuid().nullable(),
    stored: z.boolean(),
    notice: z.string().min(1).nullable(),
  })
  .strict()
  .superRefine((status, context) => {
    const evaluated = status.sigizi_kesga_recording_status !== "NOT_EVALUATED";
    const fetalEvaluated = status.fetal_rights_status !== "NOT_EVALUATED";
    if (evaluated !== fetalEvaluated) {
      context.addIssue({
        code: "custom",
        path: ["fetal_rights_status"],
        message: "Program statuses must be evaluated together",
      });
    }
    if (!evaluated && (status.rule_version_id !== null || status.evidence !== null)) {
      context.addIssue({
        code: "custom",
        path: ["sigizi_kesga_recording_status"],
        message: "NOT_EVALUATED status cannot carry rule or evidence context",
      });
    }
    if (evaluated && (status.rule_version_id === null || status.evidence === null)) {
      context.addIssue({
        code: "custom",
        path: ["rule_version_id"],
        message: "Evaluated status requires rule and evidence context",
      });
    }
    if (status.stored && (status.evaluated_at === null || status.evaluated_by_type === null)) {
      context.addIssue({
        code: "custom",
        path: ["evaluated_at"],
        message: "Stored assessments require evaluation metadata",
      });
    }
  });
export type ProgramStatusResponse = z.infer<typeof programStatusResponseSchema>;

export const programAssessmentEntrySchema = z
  .object({
    id: z.string().uuid(),
    pregnancy_id: z.string().uuid(),
    rule_version_id: z.string().uuid(),
    rule_version_no: z.number().int().positive(),
    sigizi_kesga_recording_status: sigiziKesgaRecordingStatusSchema,
    fetal_rights_status: fetalRightsStatusSchema,
    evidence: programStatusEvidenceSchema,
    evaluated_at: z.string().datetime({ offset: true }),
    evaluated_by_type: assessmentEvaluatorTypeSchema,
    evaluated_by_staff_id: z.string().uuid().nullable(),
  })
  .strict()
  .superRefine((assessment, context) => {
    if (
      (assessment.evaluated_by_type === "STAFF") !==
      (assessment.evaluated_by_staff_id !== null)
    ) {
      context.addIssue({
        code: "custom",
        path: ["evaluated_by_staff_id"],
        message: "Evaluator type and staff identifier are inconsistent",
      });
    }
  });
export type ProgramAssessmentEntry = z.infer<typeof programAssessmentEntrySchema>;

export const programStatusHistoryResponseSchema = z
  .object({
    pregnancy_id: z.string().uuid(),
    assessments: z.array(programAssessmentEntrySchema).max(100),
  })
  .strict();
export type ProgramStatusHistoryResponse = z.infer<typeof programStatusHistoryResponseSchema>;

function isCalendarDate(value: string): boolean {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}
