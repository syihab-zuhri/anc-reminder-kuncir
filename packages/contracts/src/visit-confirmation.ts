import { z } from "zod";

import { milestoneCodeSchema, recordValidationStatusSchema } from "./domain.js";
import { idempotencyKeySchema } from "./idempotency.js";

const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/u, "Expected date in YYYY-MM-DD format")
  .refine(isCalendarDate, "Expected a valid calendar date");

export const visitConfirmationRequestSchema = z
  .object({
    idempotency_key: idempotencyKeySchema,
    occurred_on: isoDateSchema,
    facility_id: z.string().uuid(),
  })
  .strict();
export type VisitConfirmationRequest = z.infer<typeof visitConfirmationRequestSchema>;

export const visitConfirmationSourceSchema = z.literal("STAFF_WEB");
export type VisitConfirmationSource = z.infer<typeof visitConfirmationSourceSchema>;

export const visitConfirmationResponseSchema = z
  .object({
    id: z.string().uuid(),
    milestone_id: z.string().uuid(),
    pregnancy_id: z.string().uuid(),
    code: milestoneCodeSchema,
    visit_status: z.literal("CONFIRMED"),
    record_validation_status: recordValidationStatusSchema,
    occurred_on: isoDateSchema,
    facility_id: z.string().uuid(),
    confirmation_source: visitConfirmationSourceSchema,
    confirmed_by_staff_id: z.string().uuid(),
    confirmed_at: z.string().datetime({ offset: true }),
  })
  .strict();
export type VisitConfirmationResponse = z.infer<typeof visitConfirmationResponseSchema>;

function isCalendarDate(value: string): boolean {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}
