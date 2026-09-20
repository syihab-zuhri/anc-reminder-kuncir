import { z } from "zod";

export const announcementCreateRequestSchema = z
  .object({
    title: z.string().trim().min(1, "Judul wajib diisi").max(120, "Judul maksimal 120 karakter"),
    body: z
      .string()
      .trim()
      .min(1, "Isi pengumuman wajib diisi")
      .max(2000, "Isi pengumuman maksimal 2000 karakter"),
  })
  .strict();

export const announcementDeliveryRowSchema = z
  .object({
    id: z.string().uuid(),
    device_id: z.string().uuid(),
    status: z.enum(["SUCCESS", "FAILED"]),
    provider_message_id: z.string().nullable(),
    error_code: z.string().nullable(),
    created_at: z.string().datetime({ offset: true }),
  })
  .strict();

export const announcementRowSchema = z
  .object({
    id: z.string().uuid(),
    staff_user_id: z.string().uuid(),
    staff_username: z.string().nullable(),
    title: z.string(),
    body: z.string(),
    created_at: z.string().datetime({ offset: true }),
    sent_at: z.string().datetime({ offset: true }).nullable(),
    total_devices: z.number().int().nonnegative(),
    success_count: z.number().int().nonnegative(),
    failed_count: z.number().int().nonnegative(),
  })
  .strict();

export const announcementListResponseSchema = z
  .object({
    announcements: z.array(announcementRowSchema),
  })
  .strict();

export const announcementCreateResponseSchema = z
  .object({
    id: z.string().uuid(),
    title: z.string(),
    body: z.string(),
    created_at: z.string().datetime({ offset: true }),
    sent_at: z.string().datetime({ offset: true }),
    total_devices: z.number().int().nonnegative(),
    success_count: z.number().int().nonnegative(),
    failed_count: z.number().int().nonnegative(),
  })
  .strict();

export type AnnouncementCreateRequest = z.infer<typeof announcementCreateRequestSchema>;
export type AnnouncementRow = z.infer<typeof announcementRowSchema>;
export type AnnouncementListResponse = z.infer<typeof announcementListResponseSchema>;
export type AnnouncementCreateResponse = z.infer<typeof announcementCreateResponseSchema>;
