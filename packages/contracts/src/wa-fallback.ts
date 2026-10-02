import { z } from "zod";

import { milestoneCodeSchema, waFallbackActionStatusSchema } from "./domain.js";

// Reuses the authoritative DB enum. A wa.me link never reports delivery, so
// RESOLVED_MANUALLY records staff follow-up, not message receipt.
export const waFallbackStatusSchema = waFallbackActionStatusSchema;

const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/u, "Expected date in YYYY-MM-DD format");
export type WaFallbackStatus = z.infer<typeof waFallbackStatusSchema>;

export const waFallbackItemSchema = z
  .object({
    id: z.string().uuid(),
    reminder_cycle_id: z.string().uuid(),
    mother_id: z.string().uuid(),
    mother_full_name: z.string(),
    phone_number_masked: z.string(),
    milestone_code: milestoneCodeSchema,
    due_at: z.string().datetime({ offset: true }).nullable(),
    // Last day of the visit window from the ANC plan, so staff can see how urgent a follow-up is
    // when no explicit appointment (due_at) was set.
    window_end_date: isoDateSchema.nullable(),
    status: waFallbackStatusSchema,
    wa_me_url: z.string().url().nullable(),
    link_generated_at: z.string().datetime({ offset: true }).nullable(),
    link_opened_at: z.string().datetime({ offset: true }).nullable(),
    resolved_at: z.string().datetime({ offset: true }).nullable(),
    resolved_by: z.string().uuid().nullable(),
    manual_note: z.string().nullable(),
  })
  .strict();
export type WaFallbackItem = z.infer<typeof waFallbackItemSchema>;

export const waFallbackQueueResponseSchema = z
  .object({
    items: z.array(waFallbackItemSchema),
    total: z.number().int().min(0),
  })
  .strict();
export type WaFallbackQueueResponse = z.infer<typeof waFallbackQueueResponseSchema>;

export const generateWaLinkResponseSchema = z
  .object({
    fallback_id: z.string().uuid(),
    wa_me_url: z.string().url(),
    generated_at: z.string().datetime({ offset: true }),
    status: z.literal("LINK_GENERATED"),
    disclaimer: z.literal(
      "Link wa.me ini adalah aksi manual Bidan dan tidak menjamin status pengiriman/penerimaan pesan di WhatsApp.",
    ),
  })
  .strict();
export type GenerateWaLinkResponse = z.infer<typeof generateWaLinkResponseSchema>;

export const resolveWaFallbackRequestSchema = z
  .object({
    manual_note: z.string().trim().min(1).max(500).optional(),
  })
  .strict();
export type ResolveWaFallbackRequest = z.infer<typeof resolveWaFallbackRequestSchema>;

export const markWaFallbackUnreachableRequestSchema = z
  .object({
    manual_note: z.string().trim().min(1).max(500),
  })
  .strict();
export type MarkWaFallbackUnreachableRequest = z.infer<
  typeof markWaFallbackUnreachableRequestSchema
>;
