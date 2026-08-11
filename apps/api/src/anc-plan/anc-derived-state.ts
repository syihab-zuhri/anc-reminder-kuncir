import type {
  AncPlanKind,
  DatingBasis,
  FacilityType,
  MilestoneCategory,
  MilestoneCode,
  PregnancyMilestoneListResponse,
  PregnancyMilestoneResponse,
  PregnancyStatus,
  RecordValidationStatus,
  RequiredFacilityPolicy,
  RuleVersionStatus,
  VisitStatus,
} from "@anc/contracts";

import { dateOnlyInTimezone } from "../registry/registry-validation.js";

const terminalVisitStatuses = new Set<VisitStatus>(["CONFIRMED", "CANCELLED", "NOT_APPLICABLE"]);

export interface PregnancyMilestoneSnapshotItem {
  readonly id: string;
  readonly pregnancyId: string;
  readonly ruleId: string;
  readonly code: MilestoneCode;
  readonly trimesterLabel: string;
  readonly targetWeekStart: number | null;
  readonly targetWeekEnd: number | null;
  readonly milestoneCategory: MilestoneCategory;
  readonly requiredFacilityPolicy: RequiredFacilityPolicy;
  readonly allowedFacilityTypes: readonly FacilityType[];
  readonly reminderEnabled: boolean;
  readonly reminderIntervalDays: 3;
  readonly dueAt: Date | null;
  readonly visitStatus: VisitStatus;
  readonly recordValidationStatus: RecordValidationStatus;
}

export interface PregnancyMilestoneSnapshot {
  readonly pregnancyId: string;
  readonly carePlanVersionId: string;
  readonly planVersionNo: number;
  readonly planKind: AncPlanKind;
  readonly planStatus: RuleVersionStatus;
  readonly datingBasis: DatingBasis;
  readonly datingDate: string;
  readonly pregnancyStatus: PregnancyStatus;
  readonly closedAt: Date | null;
  readonly milestones: readonly PregnancyMilestoneSnapshotItem[];
}

export class InvalidPregnancyDatingStateError extends Error {
  public constructor() {
    super("Pregnancy dating date is later than the requested calculation date");
    this.name = "InvalidPregnancyDatingStateError";
  }
}

export class UnsupportedPregnancyDatingBasisError extends Error {
  public constructor() {
    super("Pregnancy dating basis does not have approved calculation semantics");
    this.name = "UnsupportedPregnancyDatingBasisError";
  }
}

export function derivePregnancyMilestoneState(
  snapshot: PregnancyMilestoneSnapshot,
  asOf: Date,
  timezone: string,
): PregnancyMilestoneListResponse {
  if (snapshot.datingBasis !== "PREGNANCY_START_DATE") {
    throw new UnsupportedPregnancyDatingBasisError();
  }
  const requestedAsOfDate = dateOnlyInTimezone(asOf, timezone);
  const closedDate =
    snapshot.closedAt === null ? null : dateOnlyInTimezone(snapshot.closedAt, timezone);
  const asOfDate =
    closedDate !== null && closedDate < requestedAsOfDate ? closedDate : requestedAsOfDate;
  const totalDays = calendarDayDifference(snapshot.datingDate, asOfDate);
  if (!Number.isInteger(totalDays) || totalDays < 0) {
    throw new InvalidPregnancyDatingStateError();
  }

  const milestones = snapshot.milestones.map((milestone) =>
    deriveMilestone(milestone, snapshot.datingDate, snapshot.pregnancyStatus, asOfDate, timezone),
  );
  const nextMilestone =
    snapshot.pregnancyStatus === "ACTIVE"
      ? milestones.find((milestone) => !terminalVisitStatuses.has(milestone.visit_status))
      : undefined;

  return {
    pregnancy_id: snapshot.pregnancyId,
    care_plan_version_id: snapshot.carePlanVersionId,
    plan_version_no: snapshot.planVersionNo,
    plan_kind: snapshot.planKind,
    production_eligible: snapshot.planKind === "CLINICAL" && snapshot.planStatus === "ACTIVE",
    dating_basis: snapshot.datingBasis,
    dating_date: snapshot.datingDate,
    pregnancy_status: snapshot.pregnancyStatus,
    as_of_date: asOfDate,
    gestational_age: {
      total_days: totalDays,
      completed_weeks: Math.floor(totalDays / 7),
      additional_days: totalDays % 7,
    },
    trimester_label: deriveTrimesterLabel(snapshot.milestones, totalDays),
    next_milestone_code: nextMilestone?.code ?? null,
    milestones,
  };
}

function deriveMilestone(
  milestone: PregnancyMilestoneSnapshotItem,
  datingDate: string,
  pregnancyStatus: PregnancyStatus,
  asOfDate: string,
  timezone: string,
): PregnancyMilestoneResponse {
  const explicitDueDate =
    milestone.dueAt === null ? null : dateOnlyInTimezone(milestone.dueAt, timezone);
  const targetDateStart =
    explicitDueDate ??
    (milestone.targetWeekStart === null
      ? null
      : addCalendarDays(datingDate, milestone.targetWeekStart * 7));
  const targetDateEnd =
    explicitDueDate ??
    (milestone.targetWeekEnd === null
      ? null
      : addCalendarDays(datingDate, milestone.targetWeekEnd * 7 + 6));
  const scheduleSource =
    explicitDueDate !== null
      ? "EXPLICIT_DUE_AT"
      : targetDateStart !== null && targetDateEnd !== null
        ? "RULE_WINDOW"
        : "UNSCHEDULED";
  const visitStatus = deriveVisitStatus(
    milestone.visitStatus,
    targetDateStart,
    targetDateEnd,
    asOfDate,
  );

  return {
    id: milestone.id,
    pregnancy_id: milestone.pregnancyId,
    rule_id: milestone.ruleId,
    code: milestone.code,
    trimester_label: milestone.trimesterLabel,
    target_week_start: milestone.targetWeekStart,
    target_week_end: milestone.targetWeekEnd,
    milestone_category: milestone.milestoneCategory,
    required_facility_policy: milestone.requiredFacilityPolicy,
    allowed_facility_types: [...milestone.allowedFacilityTypes],
    reminder_enabled: milestone.reminderEnabled,
    reminder_interval_days: milestone.reminderIntervalDays,
    due_at: milestone.dueAt?.toISOString() ?? null,
    target_date_start: targetDateStart,
    target_date_end: targetDateEnd,
    schedule_source: scheduleSource,
    visit_status: visitStatus,
    record_validation_status: milestone.recordValidationStatus,
    reminder_eligible:
      pregnancyStatus === "ACTIVE" &&
      milestone.reminderEnabled &&
      (visitStatus === "DUE" || visitStatus === "OVERDUE"),
  };
}

function deriveVisitStatus(
  storedStatus: VisitStatus,
  targetDateStart: string | null,
  targetDateEnd: string | null,
  asOfDate: string,
): VisitStatus {
  if (terminalVisitStatuses.has(storedStatus)) return storedStatus;
  if (targetDateStart === null || targetDateEnd === null) return "UPCOMING";
  if (asOfDate < targetDateStart) return "UPCOMING";
  if (asOfDate <= targetDateEnd) return "DUE";
  return "OVERDUE";
}

function deriveTrimesterLabel(
  milestones: readonly PregnancyMilestoneSnapshotItem[],
  totalDays: number,
): string | null {
  const currentWeek = Math.floor(totalDays / 7);
  const scheduled = milestones.filter(
    (milestone) => milestone.targetWeekStart !== null && milestone.targetWeekEnd !== null,
  );
  const current = [...scheduled]
    .reverse()
    .find(
      (milestone) =>
        currentWeek >= (milestone.targetWeekStart ?? 0) &&
        currentWeek <= (milestone.targetWeekEnd ?? -1),
    );
  if (current !== undefined) return current.trimesterLabel;
  const upcoming = scheduled.find(
    (milestone) => currentWeek < (milestone.targetWeekStart ?? Number.POSITIVE_INFINITY),
  );
  return upcoming?.trimesterLabel ?? scheduled.at(-1)?.trimesterLabel ?? null;
}

function calendarDayDifference(startDate: string, endDate: string): number {
  return Math.trunc((dateOnlyToEpoch(endDate) - dateOnlyToEpoch(startDate)) / 86_400_000);
}

function addCalendarDays(date: string, days: number): string {
  return new Date(dateOnlyToEpoch(date) + days * 86_400_000).toISOString().slice(0, 10);
}

function dateOnlyToEpoch(date: string): number {
  return Date.parse(`${date}T00:00:00.000Z`);
}
