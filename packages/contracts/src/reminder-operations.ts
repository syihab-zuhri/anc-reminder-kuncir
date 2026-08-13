import { z } from "zod";

import {
  milestoneCodeSchema,
  pushAttemptStatusSchema,
  waFallbackActionStatusSchema,
} from "./domain.js";

export const reminderFailureSummarySchema = z
  .object({
    active_cycles_count: z.number().int().min(0),
    pending_push_attempts_count: z.number().int().min(0),
    retryable_push_failures_count: z.number().int().min(0),
    terminal_push_failures_count: z.number().int().min(0),
    unresolved_fallbacks_count: z.number().int().min(0),
    escalated_fallbacks_count: z.number().int().min(0),
    unreachable_fallbacks_count: z.number().int().min(0),
  })
  .strict();

export const reminderFailureKindSchema = z.enum([
  "NO_ACTIVE_DEVICE",
  "PUSH_PENDING",
  "RETRYABLE_FAILURE",
  "TERMINAL_FAILURE",
  "NO_PUSH_ATTEMPT",
]);

export const reminderFallbackOperationalItemSchema = z
  .object({
    fallback_id: z.string().uuid(),
    reminder_cycle_id: z.string().uuid(),
    mother_id: z.string().uuid(),
    mother_full_name: z.string().trim().min(1),
    phone_number_masked: z.string().trim().min(1),
    village_name: z.string().nullable(),
    milestone_code: milestoneCodeSchema,
    push_failure_summary: reminderFailureKindSchema,
    latest_push_attempt_status: pushAttemptStatusSchema.nullable(),
    push_attempt_count: z.number().int().min(0),
    fallback_status: waFallbackActionStatusSchema,
    fallback_created_at: z.string().datetime({ offset: true }),
    fallback_age_hours: z.number().int().min(0),
    escalated: z.boolean(),
  })
  .strict();

export const reminderSummaryResponseSchema = z
  .object({
    generated_at: z.string().datetime({ offset: true }),
    fallback_sla_hours: z.number().int().positive(),
    summary: reminderFailureSummarySchema,
    oldest_pending_push_attempt_at: z.string().datetime({ offset: true }).nullable(),
    oldest_unresolved_fallback_at: z.string().datetime({ offset: true }).nullable(),
    fallback_queue: z.array(reminderFallbackOperationalItemSchema),
    whatsapp_delivery_status: z.literal("UNKNOWN"),
  })
  .strict();

export type ReminderFailureKind = z.infer<typeof reminderFailureKindSchema>;
export type ReminderFallbackOperationalItem = z.infer<typeof reminderFallbackOperationalItemSchema>;
export type ReminderSummaryResponse = z.infer<typeof reminderSummaryResponseSchema>;
