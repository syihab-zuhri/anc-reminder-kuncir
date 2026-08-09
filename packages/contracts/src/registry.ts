import { z } from "zod";

import {
  consentPurposeSchema,
  consentStatusSchema,
  datingBasisSchema,
  pregnancyStatusSchema,
} from "./domain.js";
import { idempotencyKeySchema } from "./idempotency.js";

const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/u, "Expected date in YYYY-MM-DD format")
  .refine(isCalendarDate, "Expected a valid calendar date");

export const motherRegistrationRequestSchema = z
  .object({
    idempotency_key: idempotencyKeySchema,
    full_name: z.string().trim().min(2).max(160),
    nik: z
      .string()
      .trim()
      .regex(/^\d{16}$/u, "NIK must contain exactly 16 digits"),
    address: z.string().trim().min(5).max(500),
    phone_number: z.string().trim().min(5).max(32),
    pregnancy_start_date: isoDateSchema,
    consent: z
      .object({
        notification_allowed: z.boolean(),
      })
      .strict(),
  })
  .strict();
export type MotherRegistrationRequest = z.infer<typeof motherRegistrationRequestSchema>;

export const motherRegistrationResponseSchema = z
  .object({
    mother: z
      .object({
        id: z.string().uuid(),
        health_center_id: z.string().uuid(),
        full_name: z.string().min(1),
        phone_masked: z.string().min(1),
      })
      .strict(),
    pregnancy: z
      .object({
        id: z.string().uuid(),
        mother_id: z.string().uuid(),
        health_center_id: z.string().uuid(),
        dating_basis: z.literal(datingBasisSchema.enum.PREGNANCY_START_DATE),
        dating_date: isoDateSchema,
        status: z.literal(pregnancyStatusSchema.enum.ACTIVE),
      })
      .strict(),
    consent: z
      .object({
        id: z.string().uuid(),
        mother_id: z.string().uuid(),
        purpose: z.literal(consentPurposeSchema.enum.REMINDER),
        status: consentStatusSchema,
        source: z.literal("STAFF_REGISTRATION"),
        recorded_at: z.string().datetime({ offset: true }),
      })
      .strict(),
  })
  .strict();
export type MotherRegistrationResponse = z.infer<typeof motherRegistrationResponseSchema>;

const mutationReasonSchema = z.string().trim().min(3).max(200);

export const pregnancyCreateRequestSchema = z
  .object({
    idempotency_key: idempotencyKeySchema,
    pregnancy_start_date: isoDateSchema,
  })
  .strict();
export type PregnancyCreateRequest = z.infer<typeof pregnancyCreateRequestSchema>;

export const pregnancyDatingRevisionRequestSchema = z
  .object({
    idempotency_key: idempotencyKeySchema,
    pregnancy_start_date: isoDateSchema,
    reason: mutationReasonSchema,
  })
  .strict();
export type PregnancyDatingRevisionRequest = z.infer<typeof pregnancyDatingRevisionRequestSchema>;

export const pregnancyCloseRequestSchema = z
  .object({
    idempotency_key: idempotencyKeySchema,
    reason: mutationReasonSchema,
  })
  .strict();
export type PregnancyCloseRequest = z.infer<typeof pregnancyCloseRequestSchema>;

export const pregnancyLifecycleResponseSchema = z
  .object({
    id: z.string().uuid(),
    mother_id: z.string().uuid(),
    health_center_id: z.string().uuid(),
    dating_basis: z.literal(datingBasisSchema.enum.PREGNANCY_START_DATE),
    dating_date: isoDateSchema,
    status: pregnancyStatusSchema,
    closed_at: z.string().datetime({ offset: true }).nullable(),
  })
  .strict()
  .superRefine((pregnancy, context) => {
    const hasValidClosedState =
      (pregnancy.status === "ACTIVE" && pregnancy.closed_at === null) ||
      (pregnancy.status === "CLOSED" && pregnancy.closed_at !== null);
    if (!hasValidClosedState) {
      context.addIssue({
        code: "custom",
        path: ["closed_at"],
        message: "closed_at must match pregnancy status",
      });
    }
  });
export type PregnancyLifecycleResponse = z.infer<typeof pregnancyLifecycleResponseSchema>;

export const motherAccessCodeSchema = z
  .string()
  .regex(
    /^ANC-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4}(?:-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4}){3}$/u,
    "Expected an ANC access code",
  );

export const motherAccessCredentialMutationRequestSchema = z
  .object({
    idempotency_key: idempotencyKeySchema,
    reason: mutationReasonSchema,
  })
  .strict();
export type MotherAccessCredentialMutationRequest = z.infer<
  typeof motherAccessCredentialMutationRequestSchema
>;

export const motherAccessCredentialIssueResponseSchema = z
  .object({
    id: z.string().uuid(),
    mother_id: z.string().uuid(),
    issuance_type: z.enum(["ISSUED", "REISSUED"]),
    status: z.literal("ACTIVE"),
    issued_at: z.string().datetime({ offset: true }),
    one_time_code: motherAccessCodeSchema.nullable(),
    code_delivery: z.enum(["DISPLAY_ONCE", "NOT_AVAILABLE_ON_REPLAY"]),
  })
  .strict()
  .superRefine((credential, context) => {
    const validDelivery =
      (credential.code_delivery === "DISPLAY_ONCE" && credential.one_time_code !== null) ||
      (credential.code_delivery === "NOT_AVAILABLE_ON_REPLAY" && credential.one_time_code === null);
    if (!validDelivery) {
      context.addIssue({
        code: "custom",
        path: ["one_time_code"],
        message: "one_time_code must match code_delivery",
      });
    }
  });
export type MotherAccessCredentialIssueResponse = z.infer<
  typeof motherAccessCredentialIssueResponseSchema
>;

export const motherAccessCredentialRevokeResponseSchema = z
  .object({
    id: z.string().uuid(),
    mother_id: z.string().uuid(),
    status: z.literal("REVOKED"),
    issued_at: z.string().datetime({ offset: true }),
    revoked_at: z.string().datetime({ offset: true }),
  })
  .strict();
export type MotherAccessCredentialRevokeResponse = z.infer<
  typeof motherAccessCredentialRevokeResponseSchema
>;

function isCalendarDate(value: string): boolean {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}
