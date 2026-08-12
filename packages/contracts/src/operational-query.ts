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

const limitSchema = z
  .preprocess((val) => (val === undefined ? 20 : Number(val)), z.number().int().min(1).max(100))
  .default(20);

export const motherListQuerySchema = z
  .object({
    search: z.string().trim().max(100).optional(),
    village_id: z.string().uuid().optional(),
    pregnancy_status: pregnancyStatusSchema.optional(),
    cursor: z.string().trim().max(256).optional(),
    limit: limitSchema,
  })
  .strict();
export type MotherListQuery = z.infer<typeof motherListQuerySchema>;

export const motherSummarySchema = z
  .object({
    id: z.string().uuid(),
    health_center_id: z.string().uuid(),
    full_name: z.string().min(1),
    phone_masked: z.string().min(1),
    address: z.string().min(1),
    village_id: z.string().uuid().nullable(),
    village_name: z.string().min(1).nullable(),
    created_at: z.string().datetime({ offset: true }),
    active_pregnancy: z
      .object({
        id: z.string().uuid(),
        dating_date: isoDateSchema,
        status: pregnancyStatusSchema,
        completed_weeks: z.number().int().min(0),
        completed_days: z.number().int().min(0).max(6),
        trimester_label: z.string().min(1),
      })
      .strict()
      .nullable(),
  })
  .strict();
export type MotherSummary = z.infer<typeof motherSummarySchema>;

export const motherListResponseSchema = z
  .object({
    items: z.array(motherSummarySchema),
    next_cursor: z.string().nullable(),
    has_more: z.boolean(),
  })
  .strict();
export type MotherListResponse = z.infer<typeof motherListResponseSchema>;

export const motherDetailResponseSchema = z
  .object({
    mother: motherSummarySchema,
  })
  .strict();
export type MotherDetailResponse = z.infer<typeof motherDetailResponseSchema>;

export const operationalMilestonesQuerySchema = z
  .object({
    status: visitStatusSchema.optional(),
    milestone_code: milestoneCodeSchema.optional(),
    village_id: z.string().uuid().optional(),
    due_date_from: isoDateSchema.optional(),
    due_date_to: isoDateSchema.optional(),
    cursor: z.string().trim().max(256).optional(),
    limit: limitSchema,
  })
  .strict();
export type OperationalMilestonesQuery = z.infer<typeof operationalMilestonesQuerySchema>;

export const operationalMilestoneItemSchema = z
  .object({
    milestone_id: z.string().uuid(),
    pregnancy_id: z.string().uuid(),
    mother_id: z.string().uuid(),
    mother_full_name: z.string().min(1),
    mother_phone_masked: z.string().min(1),
    village_id: z.string().uuid().nullable(),
    village_name: z.string().min(1).nullable(),
    milestone_code: milestoneCodeSchema,
    visit_status: visitStatusSchema,
    record_validation_status: recordValidationStatusSchema,
    due_at: isoDateSchema.nullable(),
    expected_due_date: isoDateSchema.nullable(),
    occurred_on: isoDateSchema.nullable(),
    completed_weeks: z.number().int().min(0),
    completed_days: z.number().int().min(0).max(6),
    trimester_label: z.string().min(1),
  })
  .strict();
export type OperationalMilestoneItem = z.infer<typeof operationalMilestoneItemSchema>;

export const operationalMilestonesResponseSchema = z
  .object({
    items: z.array(operationalMilestoneItemSchema),
    next_cursor: z.string().nullable(),
    has_more: z.boolean(),
  })
  .strict();
export type OperationalMilestonesResponse = z.infer<typeof operationalMilestonesResponseSchema>;
