import { z } from "zod";

import { idempotencyKeySchema } from "./idempotency.js";

const schemaVersionSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9][a-z0-9._-]*$/u, "Expected a lowercase version identifier");

const recordPayloadSchema = z.record(z.string(), z.json()).superRefine((payload, context) => {
  if (Object.keys(payload).length === 0) {
    context.addIssue({ code: "custom", message: "Record payload must not be empty" });
    return;
  }
  const inspection = inspectJson(payload);
  if (inspection.unsafeKey !== null) {
    context.addIssue({
      code: "custom",
      message: `Unsafe or invalid object key: ${inspection.unsafeKey}`,
    });
  }
  if (inspection.depth > 8) {
    context.addIssue({ code: "custom", message: "Record payload exceeds maximum depth" });
  }
  if (inspection.nodes > 1024) {
    context.addIssue({ code: "custom", message: "Record payload is too complex" });
  }
  if (new TextEncoder().encode(JSON.stringify(payload)).byteLength > 65_536) {
    context.addIssue({ code: "custom", message: "Record payload exceeds 64 KiB" });
  }
});

export const k1K6MilestoneCodeSchema = z.enum(["K1", "K2", "K3", "K4", "K5", "K6"]);
export type K1K6MilestoneCode = z.infer<typeof k1K6MilestoneCodeSchema>;

export const clinicalRecordSaveRequestSchema = z
  .object({
    idempotency_key: idempotencyKeySchema,
    expected_revision_id: z.string().uuid().nullable(),
    schema_version: schemaVersionSchema,
    record_payload: recordPayloadSchema,
  })
  .strict();
export type ClinicalRecordSaveRequest = z.infer<typeof clinicalRecordSaveRequestSchema>;

export const clinicalRecordValidateRequestSchema = z
  .object({
    idempotency_key: idempotencyKeySchema,
    expected_revision_id: z.string().uuid(),
    attestation: z.literal("DETAIL_REVIEWED_COMPLETE"),
  })
  .strict();
export type ClinicalRecordValidateRequest = z.infer<typeof clinicalRecordValidateRequestSchema>;

export const clinicalRecordReopenRequestSchema = z
  .object({
    idempotency_key: idempotencyKeySchema,
    expected_revision_id: z.string().uuid(),
    reason: z.string().trim().min(3).max(200),
  })
  .strict();
export type ClinicalRecordReopenRequest = z.infer<typeof clinicalRecordReopenRequestSchema>;

export const clinicalRecordResponseSchema = z
  .object({
    record_id: z.string().uuid(),
    milestone_id: z.string().uuid(),
    pregnancy_id: z.string().uuid(),
    code: k1K6MilestoneCodeSchema,
    revision_id: z.string().uuid(),
    revision_no: z.number().int().positive(),
    schema_version: schemaVersionSchema,
    record_payload: recordPayloadSchema,
    record_validation_status: z.enum(["INCOMPLETE", "VALIDATED"]),
    validated_at: z.string().datetime({ offset: true }).nullable(),
    validated_by_staff_id: z.string().uuid().nullable(),
  })
  .strict()
  .superRefine((record, context) => {
    const hasPartialValidationPair =
      (record.validated_at === null) !== (record.validated_by_staff_id === null);
    const hasValidationPair = record.validated_at !== null && record.validated_by_staff_id !== null;
    if (
      hasPartialValidationPair ||
      (record.record_validation_status === "VALIDATED") !== hasValidationPair
    ) {
      context.addIssue({ code: "custom", message: "Validation status metadata is inconsistent" });
    }
  });
export type ClinicalRecordResponse = z.infer<typeof clinicalRecordResponseSchema>;

interface JsonInspection {
  readonly depth: number;
  readonly nodes: number;
  readonly unsafeKey: string | null;
}

const safeKey = /^[A-Za-z0-9][A-Za-z0-9 _./:-]{0,127}$/u;
const forbiddenKeys = new Set(["__proto__", "constructor", "prototype"]);

function inspectJson(value: unknown, depth = 0): JsonInspection {
  if (value === null || typeof value !== "object") {
    return { depth, nodes: 1, unsafeKey: null };
  }
  const entries = Array.isArray(value)
    ? value.map((item, index) => [String(index), item] as const)
    : Object.entries(value as Readonly<Record<string, unknown>>);
  let maximumDepth = depth;
  let nodes = 1;
  for (const [key, child] of entries) {
    if (!Array.isArray(value) && (forbiddenKeys.has(key) || !safeKey.test(key))) {
      return { depth: maximumDepth, nodes, unsafeKey: key };
    }
    const inspected = inspectJson(child, depth + 1);
    maximumDepth = Math.max(maximumDepth, inspected.depth);
    nodes += inspected.nodes;
    if (inspected.unsafeKey !== null) {
      return { depth: maximumDepth, nodes, unsafeKey: inspected.unsafeKey };
    }
  }
  return { depth: maximumDepth, nodes, unsafeKey: null };
}
