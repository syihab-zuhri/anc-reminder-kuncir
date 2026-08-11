import { z } from "zod";

import { milestoneCodeSchema } from "./domain.js";
import { idempotencyKeySchema } from "./idempotency.js";

const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/u, "Expected date in YYYY-MM-DD format")
  .refine(isCalendarDate, "Expected a valid calendar date");

export const milestoneDueDateMutationRequestSchema = z
  .object({
    idempotency_key: idempotencyKeySchema,
    due_date: isoDateSchema,
    expected_due_date: isoDateSchema.nullable(),
    reason: z.string().trim().min(3).max(500).optional(),
  })
  .strict();
export type MilestoneDueDateMutationRequest = z.infer<typeof milestoneDueDateMutationRequestSchema>;

export const milestoneScheduleActionSchema = z.enum(["SCHEDULED", "RESCHEDULED"]);
export type MilestoneScheduleAction = z.infer<typeof milestoneScheduleActionSchema>;

export const milestoneDueDateMutationResponseSchema = z
  .object({
    event_id: z.string().uuid(),
    pregnancy_id: z.string().uuid(),
    milestone_id: z.string().uuid(),
    code: milestoneCodeSchema,
    action: milestoneScheduleActionSchema,
    previous_due_date: isoDateSchema.nullable(),
    due_date: isoDateSchema,
    due_at: z.string().datetime({ offset: true }),
    timezone: z.string().trim().min(1).max(100),
    reason: z.string().min(1).max(500).nullable(),
    occurred_at: z.string().datetime({ offset: true }),
  })
  .strict()
  .superRefine((result, context) => {
    if (
      (result.action === "SCHEDULED" && result.previous_due_date !== null) ||
      (result.action === "RESCHEDULED" &&
        (result.previous_due_date === null || result.reason === null))
    ) {
      context.addIssue({
        code: "custom",
        path: ["action"],
        message: "Schedule action must match the previous due date",
      });
    }
  });
export type MilestoneDueDateMutationResponse = z.infer<
  typeof milestoneDueDateMutationResponseSchema
>;

function isCalendarDate(value: string): boolean {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}
