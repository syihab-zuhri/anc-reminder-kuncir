import { z } from "zod";

import { milestoneCodeSchema } from "./domain.js";

export const waFallbackStatusSchema = z.enum([
  "READY",
  "LINK_GENERATED",
  "OPENED",
  "RESOLVED",
  "EXPIRED",
]);
export type WaFallbackStatus = z.infer<typeof waFallbackStatusSchema>;

export const waFallbackItemSchema = z
  .object({
    id: z.string().uuid(),
    reminder_cycle_id: z.string().uuid(),
    mother_id: z.string().uuid(),
    mother_full_name: z.string(),
    phone_number_masked: z.string(),
    milestone_code: milestoneCodeSchema,
    due_at: z.string().nullable(),
    status: waFallbackStatusSchema,
    wa_me_url: z.string().url().nullable(),
    link_generated_at: z.string().nullable(),
    resolved_at: z.string().nullable(),
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
    generated_at: z.string(),
    status: waFallbackStatusSchema,
    disclaimer: z.literal(
      "Link wa.me ini adalah aksi manual Bidan dan tidak menjamin status pengiriman/penerimaan pesan di WhatsApp.",
    ),
  })
  .strict();
export type GenerateWaLinkResponse = z.infer<typeof generateWaLinkResponseSchema>;

export const resolveWaFallbackRequestSchema = z
  .object({
    manual_note: z.string().trim().max(500).optional(),
  })
  .strict();
export type ResolveWaFallbackRequest = z.infer<typeof resolveWaFallbackRequestSchema>;
