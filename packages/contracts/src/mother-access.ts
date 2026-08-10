import { z } from "zod";

export const motherAccessValidateRequestSchema = z
  .object({
    full_name: z.string().trim().min(1).max(160),
    access_code: z.string().trim().min(1).max(64),
  })
  .strict();
export type MotherAccessValidateRequest = z.infer<typeof motherAccessValidateRequestSchema>;

export const motherSessionTokenSchema = z.string().regex(/^anc_mt_[A-Za-z0-9_-]{43}$/u);

export const motherSessionResponseSchema = z
  .object({
    token_type: z.literal("Bearer"),
    access_token: motherSessionTokenSchema,
    expires_at: z.string().datetime({ offset: true }),
  })
  .strict();
export type MotherSessionResponse = z.infer<typeof motherSessionResponseSchema>;

export const motherMeResponseSchema = z
  .object({
    id: z.string().uuid(),
    display_name: z.string().trim().min(1),
    active_pregnancy_id: z.string().uuid(),
    session_id: z.string().uuid(),
    session_expires_at: z.string().datetime({ offset: true }),
  })
  .strict();
export type MotherMeResponse = z.infer<typeof motherMeResponseSchema>;
