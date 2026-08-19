import { z } from "zod";

import { healthCenterStatusSchema, staffAssignmentScopeTypeSchema } from "./domain.js";

export const facilityTypeSchema = z.enum([
  "PUSKESMAS",
  "POSYANDU",
  "PONED",
  "HOSPITAL",
  "MIDWIFE_PRACTICE",
  "OTHER",
]);
export type FacilityType = z.infer<typeof facilityTypeSchema>;

const organizationCodeSchema = z
  .string()
  .trim()
  .min(1)
  .max(40)
  .regex(/^[A-Za-z0-9._-]+$/);

export const villageCreateRequestSchema = z
  .object({
    code: organizationCodeSchema,
    name: z.string().trim().min(2).max(160),
  })
  .strict();
export type VillageCreateRequest = z.infer<typeof villageCreateRequestSchema>;

export const facilityCreateRequestSchema = z
  .object({
    village_id: z.string().uuid().nullable().optional(),
    code: organizationCodeSchema,
    name: z.string().trim().min(2).max(160),
    facility_type: facilityTypeSchema,
  })
  .strict();
export type FacilityCreateRequest = z.infer<typeof facilityCreateRequestSchema>;

export const staffAssignmentCreateRequestSchema = z
  .object({
    staff_user_id: z.string().uuid(),
    scope_type: staffAssignmentScopeTypeSchema,
    scope_id: z.string().uuid(),
  })
  .strict();
export type StaffAssignmentCreateRequest = z.infer<typeof staffAssignmentCreateRequestSchema>;

export const assignmentRevokeRequestSchema = z
  .object({
    reason: z.string().trim().min(3).max(200),
  })
  .strict();
export type AssignmentRevokeRequest = z.infer<typeof assignmentRevokeRequestSchema>;

export const villageSchema = z
  .object({
    id: z.string().uuid(),
    health_center_id: z.string().uuid(),
    code: z.string(),
    name: z.string(),
    status: healthCenterStatusSchema,
  })
  .strict();
export type Village = z.infer<typeof villageSchema>;

export const facilitySchema = z
  .object({
    id: z.string().uuid(),
    health_center_id: z.string().uuid(),
    village_id: z.string().uuid().nullable(),
    code: z.string(),
    name: z.string(),
    facility_type: facilityTypeSchema,
    status: healthCenterStatusSchema,
  })
  .strict();
export type Facility = z.infer<typeof facilitySchema>;

export const villageUpdateRequestSchema = z
  .object({
    code: organizationCodeSchema.optional(),
    name: z.string().trim().min(2).max(160).optional(),
    status: healthCenterStatusSchema.optional(),
  })
  .strict();
export type VillageUpdateRequest = z.infer<typeof villageUpdateRequestSchema>;

export const facilityUpdateRequestSchema = z
  .object({
    village_id: z.string().uuid().nullable().optional(),
    code: organizationCodeSchema.optional(),
    name: z.string().trim().min(2).max(160).optional(),
    facility_type: facilityTypeSchema.optional(),
    status: healthCenterStatusSchema.optional(),
  })
  .strict();
export type FacilityUpdateRequest = z.infer<typeof facilityUpdateRequestSchema>;

export const staffAssignmentSchema = z
  .object({
    id: z.string().uuid(),
    staff_user_id: z.string().uuid(),
    scope_type: staffAssignmentScopeTypeSchema,
    scope_id: z.string().uuid(),
  })
  .strict();
export type StaffAssignment = z.infer<typeof staffAssignmentSchema>;

export const staffAssignmentDetailSchema = z
  .object({
    id: z.string().uuid(),
    staff_user_id: z.string().uuid(),
    staff_name: z.string().min(1),
    staff_identifier: z.string().min(1),
    scope_type: staffAssignmentScopeTypeSchema,
    scope_id: z.string().uuid(),
    village_name: z.string().nullable().optional(),
  })
  .strict();
export type StaffAssignmentDetail = z.infer<typeof staffAssignmentDetailSchema>;

