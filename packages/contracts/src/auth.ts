import { z } from "zod";

import { staffRoleSchema, staffUserStatusSchema } from "./domain.js";

const loginIdentifierSchema = z.string().trim().min(3).max(120);
const loginPasswordSchema = z.string().min(1).max(512);
export const newStaffPasswordSchema = z
  .string()
  .min(8)
  .max(128)
  .refine((value) => /[A-Za-z]/.test(value) && /\d/.test(value), {
    message: "Password must contain letters and numbers",
  });

export const staffLoginRequestSchema = z
  .object({
    login_identifier: loginIdentifierSchema,
    password: loginPasswordSchema,
  })
  .strict();
export type StaffLoginRequest = z.infer<typeof staffLoginRequestSchema>;

const accessTokenSchema = z.string().regex(/^anc_at_[A-Za-z0-9_-]{43}$/);
const refreshTokenSchema = z.string().regex(/^anc_rt_[A-Za-z0-9_-]{43}$/);

export const staffRefreshRequestSchema = z
  .object({
    refresh_token: refreshTokenSchema,
  })
  .strict();
export type StaffRefreshRequest = z.infer<typeof staffRefreshRequestSchema>;

export const staffSessionRevokeRequestSchema = z
  .object({
    session_id: z.string().uuid(),
    reason: z.string().trim().min(3).max(200),
  })
  .strict();
export type StaffSessionRevokeRequest = z.infer<typeof staffSessionRevokeRequestSchema>;

export const staffTokenResponseSchema = z
  .object({
    token_type: z.literal("Bearer"),
    access_token: accessTokenSchema,
    access_expires_at: z.string().datetime({ offset: true }),
    refresh_token: refreshTokenSchema,
    refresh_expires_at: z.string().datetime({ offset: true }),
  })
  .strict();
export type StaffTokenResponse = z.infer<typeof staffTokenResponseSchema>;

export const staffMeResponseSchema = z
  .object({
    id: z.string().uuid(),
    health_center_id: z.string().uuid().nullable(),
    display_name: z.string().trim().min(1),
    role: staffRoleSchema,
    status: staffUserStatusSchema,
    session_id: z.string().uuid(),
  })
  .strict();
export type StaffMeResponse = z.infer<typeof staffMeResponseSchema>;

export const staffCreateRequestSchema = z
  .object({
    login_identifier: loginIdentifierSchema,
    display_name: z.string().trim().min(2).max(160),
    role: z.enum(["BIDAN", "PUSKESMAS"]),
    password: newStaffPasswordSchema,
  })
  .strict();
export type StaffCreateRequest = z.infer<typeof staffCreateRequestSchema>;

export const staffStatusUpdateRequestSchema = z
  .object({
    status: staffUserStatusSchema,
    reason: z.string().trim().min(3).max(200),
  })
  .strict();
export type StaffStatusUpdateRequest = z.infer<typeof staffStatusUpdateRequestSchema>;

export const staffUpdateRequestSchema = z
  .object({
    display_name: z.string().trim().min(2).max(160).optional(),
    password: newStaffPasswordSchema.optional(),
  })
  .strict();
export type StaffUpdateRequest = z.infer<typeof staffUpdateRequestSchema>;

export const staffSummarySchema = z
  .object({
    id: z.string().uuid(),
    health_center_id: z.string().uuid().nullable(),
    login_identifier: loginIdentifierSchema,
    display_name: z.string().trim().min(1),
    role: staffRoleSchema,
    status: staffUserStatusSchema,
  })
  .strict();
export type StaffSummary = z.infer<typeof staffSummarySchema>;
