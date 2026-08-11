import { z } from "zod";

export const actorRoleSchema = z.enum([
  "BUMIL",
  "BIDAN",
  "PUSKESMAS",
  "SUPER_ADMIN",
  "REMINDER_WORKER",
]);
export type ActorRole = z.infer<typeof actorRoleSchema>;

export const staffRoleSchema = z.enum(["BIDAN", "PUSKESMAS", "SUPER_ADMIN"]);
export type StaffRole = z.infer<typeof staffRoleSchema>;

export const healthCenterStatusSchema = z.enum(["ACTIVE", "INACTIVE"]);
export type HealthCenterStatus = z.infer<typeof healthCenterStatusSchema>;

export const staffUserStatusSchema = z.enum(["ACTIVE", "DISABLED", "LOCKED"]);
export type StaffUserStatus = z.infer<typeof staffUserStatusSchema>;

export const staffAssignmentScopeTypeSchema = z.enum(["AREA", "MOTHER"]);
export type StaffAssignmentScopeType = z.infer<typeof staffAssignmentScopeTypeSchema>;

export const datingBasisSchema = z.enum([
  "PREGNANCY_START_DATE",
  "HPHT",
  "CLINICALLY_CONFIRMED_DATE",
  "OTHER_APPROVED",
]);
export type DatingBasis = z.infer<typeof datingBasisSchema>;

export const pregnancyStatusSchema = z.enum(["ACTIVE", "CLOSED"]);
export type PregnancyStatus = z.infer<typeof pregnancyStatusSchema>;

export const ruleVersionStatusSchema = z.enum(["DRAFT", "APPROVED", "ACTIVE", "ARCHIVED"]);
export type RuleVersionStatus = z.infer<typeof ruleVersionStatusSchema>;

export const ancPlanKindSchema = z.enum(["CLINICAL", "SYNTHETIC"]);
export type AncPlanKind = z.infer<typeof ancPlanKindSchema>;

export const milestoneCodeSchema = z.enum(["K1", "K2", "K3", "K4", "K5", "K6", "K7", "K8"]);
export type MilestoneCode = z.infer<typeof milestoneCodeSchema>;

export const milestoneCategorySchema = z.enum(["ANC", "DELIVERY"]);
export type MilestoneCategory = z.infer<typeof milestoneCategorySchema>;

export const requiredFacilityPolicySchema = z.enum([
  "PUSKESMAS_REQUIRED",
  "FLEXIBLE",
  "PONED_OR_RS_REQUIRED",
]);
export type RequiredFacilityPolicy = z.infer<typeof requiredFacilityPolicySchema>;

export const visitStatusSchema = z.enum([
  "UPCOMING",
  "DUE",
  "OVERDUE",
  "CONFIRMED",
  "CANCELLED",
  "NOT_APPLICABLE",
]);
export type VisitStatus = z.infer<typeof visitStatusSchema>;

export const recordValidationStatusSchema = z.enum(["NOT_REQUIRED", "INCOMPLETE", "VALIDATED"]);
export type RecordValidationStatus = z.infer<typeof recordValidationStatusSchema>;

export const k1K6RecordStatusSchema = z.enum(["INCOMPLETE", "VALIDATED"]);
export type K1K6RecordStatus = z.infer<typeof k1K6RecordStatusSchema>;

export const visitConfirmationActionSchema = z.enum(["CONFIRM", "CORRECT"]);
export type VisitConfirmationAction = z.infer<typeof visitConfirmationActionSchema>;

export const recordValidationActionSchema = z.enum(["VALIDATE", "REOPEN", "CORRECT"]);
export type RecordValidationAction = z.infer<typeof recordValidationActionSchema>;

export const motherAccessCredentialStatusSchema = z.enum(["ACTIVE", "REVOKED"]);
export type MotherAccessCredentialStatus = z.infer<typeof motherAccessCredentialStatusSchema>;

export const devicePlatformSchema = z.literal("ANDROID");
export type DevicePlatform = z.infer<typeof devicePlatformSchema>;

export const deviceStatusSchema = z.enum(["ACTIVE", "INVALID", "REVOKED"]);
export type DeviceStatus = z.infer<typeof deviceStatusSchema>;

export const consentPurposeSchema = z.enum(["REMINDER", "DATA_PROCESSING", "OTHER"]);
export type ConsentPurpose = z.infer<typeof consentPurposeSchema>;

export const consentStatusSchema = z.enum(["GRANTED", "WITHDRAWN"]);
export type ConsentStatus = z.infer<typeof consentStatusSchema>;

export const reminderCycleStatusSchema = z.enum([
  "PENDING",
  "PUSH_ATTEMPTING",
  "PUSH_SUCCEEDED",
  "WA_ACTION_REQUIRED",
  "MANUAL_FOLLOWUP",
  "ESCALATED",
  "CANCELLED",
]);
export type ReminderCycleStatus = z.infer<typeof reminderCycleStatusSchema>;

export const pushAttemptStatusSchema = z.enum([
  "PENDING",
  "SUCCESS",
  "RETRYABLE_FAILURE",
  "TERMINAL_FAILURE",
]);
export type PushAttemptStatus = z.infer<typeof pushAttemptStatusSchema>;

export const waFallbackActionStatusSchema = z.enum([
  "READY",
  "LINK_GENERATED",
  "LINK_OPENED",
  "RESOLVED_MANUALLY",
  "UNREACHABLE",
  "SKIPPED",
  "EXPIRED",
]);
export type WaFallbackActionStatus = z.infer<typeof waFallbackActionStatusSchema>;

// A wa.me link has no provider callback, so its delivery state is deliberately
// closed to UNKNOWN rather than a synthetic SENT/DELIVERED/READ status.
export const waDeliveryStatusSchema = z.literal("UNKNOWN");
export type WaDeliveryStatus = z.infer<typeof waDeliveryStatusSchema>;

export const programRequirementTypeSchema = z.enum([
  "MILESTONE_VALIDATED",
  "FIELD_PRESENT",
  "OTHER_APPROVED",
]);
export type ProgramRequirementType = z.infer<typeof programRequirementTypeSchema>;

export const sigiziKesgaRecordingStatusSchema = z.enum([
  "IN_PROGRESS",
  "COMPLETE",
  "NOT_EVALUATED",
]);
export type SigiziKesgaRecordingStatus = z.infer<typeof sigiziKesgaRecordingStatusSchema>;

export const fetalRightsStatusSchema = z.enum(["NOT_YET_MET", "MET", "NOT_EVALUATED"]);
export type FetalRightsStatus = z.infer<typeof fetalRightsStatusSchema>;

export const assessmentEvaluatorTypeSchema = z.enum(["SYSTEM", "STAFF"]);
export type AssessmentEvaluatorType = z.infer<typeof assessmentEvaluatorTypeSchema>;
