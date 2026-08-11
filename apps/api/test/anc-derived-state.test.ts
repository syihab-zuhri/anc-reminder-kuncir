import { milestoneCodeSchema } from "@anc/contracts";
import { describe, expect, it } from "vitest";

import {
  derivePregnancyMilestoneState,
  InvalidPregnancyDatingStateError,
  type PregnancyMilestoneSnapshot,
  UnsupportedPregnancyDatingBasisError,
} from "../src/anc-plan/anc-derived-state.js";

describe("server-derived ANC state", () => {
  it("uses the configured timezone and rule window without hardcoded trimester cutoffs", () => {
    const beforeLocalMidnight = derivePregnancyMilestoneState(
      snapshot(),
      new Date("2026-08-07T16:59:59.000Z"),
      "Asia/Jakarta",
    );
    expect(beforeLocalMidnight).toMatchObject({
      as_of_date: "2026-08-07",
      gestational_age: { total_days: 6, completed_weeks: 0, additional_days: 6 },
      trimester_label: "SYNTHETIC_PHASE_1",
      next_milestone_code: "K1",
    });
    expect(beforeLocalMidnight.milestones[0]).toMatchObject({
      target_date_start: "2026-08-08",
      target_date_end: "2026-08-14",
      visit_status: "UPCOMING",
      reminder_eligible: false,
    });

    const atLocalMidnight = derivePregnancyMilestoneState(
      snapshot(),
      new Date("2026-08-07T17:00:00.000Z"),
      "Asia/Jakarta",
    );
    expect(atLocalMidnight).toMatchObject({
      as_of_date: "2026-08-08",
      gestational_age: { total_days: 7, completed_weeks: 1, additional_days: 0 },
    });
    expect(atLocalMidnight.milestones[0]).toMatchObject({
      schedule_source: "RULE_WINDOW",
      visit_status: "DUE",
      reminder_eligible: true,
    });
  });

  it("preserves terminal state and selects the earliest unfinished milestone", () => {
    const input = snapshot();
    const state = derivePregnancyMilestoneState(
      {
        ...input,
        milestones: input.milestones.map((milestone) =>
          milestone.code === "K1" ? { ...milestone, visitStatus: "CONFIRMED" } : milestone,
        ),
      },
      new Date("2026-08-14T17:00:00.000Z"),
      "Asia/Jakarta",
    );
    expect(state.milestones[0]).toMatchObject({
      code: "K1",
      visit_status: "CONFIRMED",
      reminder_eligible: false,
    });
    expect(state.milestones[1]).toMatchObject({
      code: "K2",
      visit_status: "DUE",
      reminder_eligible: true,
    });
    expect(state.next_milestone_code).toBe("K2");
  });

  it("gives an explicit staff schedule precedence over the rule window", () => {
    const input = snapshot();
    const state = derivePregnancyMilestoneState(
      {
        ...input,
        milestones: input.milestones.map((milestone) =>
          milestone.code === "K1"
            ? { ...milestone, dueAt: new Date("2026-08-20T02:00:00.000Z") }
            : milestone,
        ),
      },
      new Date("2026-08-19T17:00:00.000Z"),
      "Asia/Jakarta",
    );
    expect(state.milestones[0]).toMatchObject({
      target_date_start: "2026-08-20",
      target_date_end: "2026-08-20",
      schedule_source: "EXPLICIT_DUE_AT",
      visit_status: "DUE",
    });
  });

  it("suppresses next/reminder eligibility for a closed pregnancy", () => {
    const input = snapshot();
    const state = derivePregnancyMilestoneState(
      {
        ...input,
        pregnancyStatus: "CLOSED",
        closedAt: new Date("2026-08-08T03:00:00.000Z"),
      },
      new Date("2026-08-14T17:00:00.000Z"),
      "Asia/Jakarta",
    );
    expect(state).toMatchObject({
      as_of_date: "2026-08-08",
      gestational_age: { total_days: 7, completed_weeks: 1, additional_days: 0 },
    });
    expect(state.next_milestone_code).toBeNull();
    expect(state.milestones.every((milestone) => !milestone.reminder_eligible)).toBe(true);
  });

  it("fails closed when dating is later than the calculation date", () => {
    expect(() =>
      derivePregnancyMilestoneState(
        { ...snapshot(), datingDate: "2026-08-09" },
        new Date("2026-08-07T17:00:00.000Z"),
        "Asia/Jakarta",
      ),
    ).toThrow(InvalidPregnancyDatingStateError);
  });

  it("rejects dating bases without approved age-offset semantics", () => {
    expect(() =>
      derivePregnancyMilestoneState(
        { ...snapshot(), datingBasis: "CLINICALLY_CONFIRMED_DATE" },
        new Date("2026-08-07T17:00:00.000Z"),
        "Asia/Jakarta",
      ),
    ).toThrow(UnsupportedPregnancyDatingBasisError);
  });
});

function snapshot(): PregnancyMilestoneSnapshot {
  return {
    pregnancyId: "60000000-0000-4000-8000-000000000001",
    carePlanVersionId: "70000000-0000-4000-8000-000000000001",
    planVersionNo: 1,
    planKind: "SYNTHETIC",
    planStatus: "DRAFT",
    datingBasis: "PREGNANCY_START_DATE",
    datingDate: "2026-08-01",
    pregnancyStatus: "ACTIVE",
    closedAt: null,
    milestones: milestoneCodeSchema.options.map((code, index) => {
      const puskesmasRequired = code === "K1" || code === "K4" || code === "K5";
      return {
        id: `72000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
        pregnancyId: "60000000-0000-4000-8000-000000000001",
        ruleId: `71000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
        code,
        trimesterLabel: `SYNTHETIC_PHASE_${Math.min(index + 1, 3)}`,
        targetWeekStart: code === "K8" ? null : index + 1,
        targetWeekEnd: code === "K8" ? null : index + 1,
        milestoneCategory: code === "K8" ? "DELIVERY" : "ANC",
        requiredFacilityPolicy:
          code === "K8"
            ? "PONED_OR_RS_REQUIRED"
            : puskesmasRequired
              ? "PUSKESMAS_REQUIRED"
              : "FLEXIBLE",
        allowedFacilityTypes:
          code === "K8"
            ? (["PONED", "HOSPITAL"] as const)
            : puskesmasRequired
              ? (["PUSKESMAS"] as const)
              : (["PUSKESMAS", "MIDWIFE_PRACTICE"] as const),
        reminderEnabled: code !== "K8",
        reminderIntervalDays: 3,
        dueAt: null,
        visitStatus: "UPCOMING",
        recordValidationStatus: index < 6 ? "INCOMPLETE" : "NOT_REQUIRED",
      };
    }),
  };
}
