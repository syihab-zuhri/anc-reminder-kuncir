import { z } from "zod";

import {
  milestoneCodeSchema,
  pregnancyStatusSchema,
  recordValidationStatusSchema,
  visitStatusSchema,
} from "./domain.js";

const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/u, "Expected date in YYYY-MM-DD format");

export const priorityActionTypeSchema = z.enum([
  "CONFIRMATION_NEEDED",
  "VALIDATION_NEEDED",
  "WA_FALLBACK_REQUIRED",
]);
export type PriorityActionType = z.infer<typeof priorityActionTypeSchema>;

export const priorityActionItemSchema = z
  .object({
    mother_id: z.string().uuid(),
    mother_full_name: z.string().min(1),
    village_name: z.string().min(1).nullable(),
    milestone_code: milestoneCodeSchema,
    visit_status: visitStatusSchema,
    due_at: isoDateSchema.nullable(),
    action_type: priorityActionTypeSchema,
  })
  .strict();
export type PriorityActionItem = z.infer<typeof priorityActionItemSchema>;

export const puskesmasDashboardResponseSchema = z
  .object({
    summary: z
      .object({
        total_active_pregnancies: z.number().int().min(0),
        milestones_due_count: z.number().int().min(0),
        milestones_overdue_count: z.number().int().min(0),
        pending_validations_count: z.number().int().min(0),
        unresolved_wa_fallbacks_count: z.number().int().min(0),
      })
      .strict(),
    priority_action_queue: z.array(priorityActionItemSchema),
  })
  .strict();
export type PuskesmasDashboardResponse = z.infer<typeof puskesmasDashboardResponseSchema>;

export const bidanConfirmationQueueItemSchema = z
  .object({
    mother_id: z.string().uuid(),
    mother_full_name: z.string().min(1),
    mother_phone_masked: z.string().min(1),
    village_name: z.string().min(1).nullable(),
    milestone_code: milestoneCodeSchema,
    visit_status: visitStatusSchema,
    due_at: isoDateSchema.nullable(),
  })
  .strict();
export type BidanConfirmationQueueItem = z.infer<typeof bidanConfirmationQueueItemSchema>;

export const bidanDashboardResponseSchema = z
  .object({
    summary: z
      .object({
        assigned_mothers_count: z.number().int().min(0),
        milestones_due_count: z.number().int().min(0),
        milestones_overdue_count: z.number().int().min(0),
        action_required_count: z.number().int().min(0),
      })
      .strict(),
    assigned_villages: z.array(
      z
        .object({
          village_id: z.string().uuid(),
          village_name: z.string().min(1),
        })
        .strict(),
    ),
    confirmation_queue: z.array(bidanConfirmationQueueItemSchema),
  })
  .strict();
export type BidanDashboardResponse = z.infer<typeof bidanDashboardResponseSchema>;

export const bumilMilestoneSummarySchema = z
  .object({
    milestone_code: milestoneCodeSchema,
    visit_status: visitStatusSchema,
    record_validation_status: recordValidationStatusSchema,
    due_at: isoDateSchema.nullable(),
    occurred_on: isoDateSchema.nullable(),
  })
  .strict();
export type BumilMilestoneSummary = z.infer<typeof bumilMilestoneSummarySchema>;

export const bumilDashboardResponseSchema = z
  .object({
    mother_info: z
      .object({
        full_name: z.string().min(1),
        address: z.string().min(1),
        village_name: z.string().min(1).nullable(),
      })
      .strict(),
    active_pregnancy: z
      .object({
        id: z.string().uuid(),
        dating_date: isoDateSchema,
        completed_weeks: z.number().int().min(0),
        completed_days: z.number().int().min(0).max(6),
        trimester_label: z.string().min(1),
        status: pregnancyStatusSchema,
      })
      .strict()
      .nullable(),
    next_milestone: z
      .object({
        milestone_code: milestoneCodeSchema,
        visit_status: visitStatusSchema,
        due_at: isoDateSchema.nullable(),
        expected_due_date: isoDateSchema.nullable(),
        recommended_facility_name: z.string().min(1).nullable(),
      })
      .strict()
      .nullable(),
    milestones: z.array(bumilMilestoneSummarySchema),
  })
  .strict();
export type BumilDashboardResponse = z.infer<typeof bumilDashboardResponseSchema>;
