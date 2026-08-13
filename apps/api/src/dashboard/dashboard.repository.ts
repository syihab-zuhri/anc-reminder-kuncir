import { Inject, Injectable } from "@nestjs/common";
import type {
  BidanConfirmationQueueItem,
  BidanDashboardResponse,
  BumilDashboardResponse,
  PregnancyMilestoneResponse,
  PriorityActionItem,
  PuskesmasDashboardResponse,
} from "@anc/contracts";
import type { DatabasePool } from "@anc/database";

import {
  derivePregnancyMilestoneState,
  type PregnancyMilestoneSnapshot,
} from "../anc-plan/anc-derived-state.js";
import { PostgresAncPlanRepository } from "../anc-plan/anc-plan.repository.js";
import type { StaffActor } from "../auth/staff-auth.types.js";
import { DATABASE_POOL } from "../infrastructure/tokens.js";
import type { MotherActor } from "../mother-access/mother-auth.types.js";
import { maskPhone } from "../registry/mother-registry.repository.js";
import { dateOnlyInTimezone } from "../registry/registry-validation.js";

export interface DashboardRepository {
  getPuskesmasDashboard(
    actor: StaffActor,
    now: Date,
    timezone: string,
  ): Promise<PuskesmasDashboardResponse>;
  getBidanDashboard(
    actor: StaffActor,
    now: Date,
    timezone: string,
  ): Promise<BidanDashboardResponse>;
  getBumilDashboard(
    actor: MotherActor,
    now: Date,
    timezone: string,
  ): Promise<BumilDashboardResponse>;
}

interface DashboardPregnancyRow {
  readonly pregnancy_id: string;
  readonly mother_id: string;
  readonly mother_full_name: string;
  readonly phone_normalized: string;
  readonly village_name: string | null;
}

interface DerivedDashboardPregnancy {
  readonly row: DashboardPregnancyRow;
  readonly snapshot: PregnancyMilestoneSnapshot;
  readonly milestones: readonly PregnancyMilestoneResponse[];
  readonly completedWeeks: number;
  readonly completedDays: number;
  readonly trimesterLabel: string | null;
  readonly nextMilestoneCode: PregnancyMilestoneResponse["code"] | null;
}

@Injectable()
export class PostgresDashboardRepository implements DashboardRepository {
  private readonly planRepository: PostgresAncPlanRepository;

  public constructor(@Inject(DATABASE_POOL) private readonly pool: DatabasePool) {
    this.planRepository = new PostgresAncPlanRepository(pool, false);
  }

  public async getPuskesmasDashboard(
    actor: StaffActor,
    now: Date,
    timezone: string,
  ): Promise<PuskesmasDashboardResponse> {
    if (actor.healthCenterId === null || actor.role !== "PUSKESMAS") {
      return emptyPuskesmasDashboard();
    }

    const pregnancyRows = await this.listActivePregnancies(`p.health_center_id = $1`, [
      actor.healthCenterId,
    ]);
    const pregnancies = await this.derivePregnancies(pregnancyRows, now, timezone);
    const milestones = pregnancies.flatMap(({ row, milestones: items }) =>
      items.map((milestone) => ({ row, milestone })),
    );

    const dueCount = milestones.filter(({ milestone }) => milestone.visit_status === "DUE").length;
    const overdueCount = milestones.filter(
      ({ milestone }) => milestone.visit_status === "OVERDUE",
    ).length;
    const pendingValidationCount = milestones.filter(
      ({ milestone }) =>
        milestone.visit_status === "CONFIRMED" &&
        milestone.record_validation_status === "INCOMPLETE",
    ).length;

    const priorityActionQueue: PriorityActionItem[] = milestones
      .filter(
        ({ milestone }) =>
          milestone.visit_status === "DUE" ||
          milestone.visit_status === "OVERDUE" ||
          (milestone.visit_status === "CONFIRMED" &&
            milestone.record_validation_status === "INCOMPLETE"),
      )
      .sort(compareDashboardMilestones)
      .slice(0, 10)
      .map(({ row, milestone }) => ({
        mother_id: row.mother_id,
        mother_full_name: row.mother_full_name,
        village_name: row.village_name,
        milestone_code: milestone.code,
        visit_status: milestone.visit_status,
        due_at: effectiveDueDate(milestone, timezone),
        action_type:
          milestone.visit_status === "CONFIRMED"
            ? "VALIDATION_NEEDED"
            : milestone.visit_status === "OVERDUE"
              ? "WA_FALLBACK_REQUIRED"
              : "CONFIRMATION_NEEDED",
      }));

    const unresolvedWaResult = await this.pool.query<{ readonly count: string }>(
      `SELECT COUNT(*)::text AS count
         FROM wa_fallback_actions AS fallback
         JOIN mothers AS mother ON mother.id = fallback.mother_id
        WHERE mother.health_center_id = $1
          AND fallback.status IN ('READY', 'LINK_GENERATED', 'LINK_OPENED')`,
      [actor.healthCenterId],
    );

    return {
      summary: {
        total_active_pregnancies: pregnancies.length,
        milestones_due_count: dueCount,
        milestones_overdue_count: overdueCount,
        pending_validations_count: pendingValidationCount,
        unresolved_wa_fallbacks_count: Number.parseInt(
          unresolvedWaResult.rows[0]?.count ?? "0",
          10,
        ),
      },
      priority_action_queue: priorityActionQueue,
    };
  }

  public async getBidanDashboard(
    actor: StaffActor,
    now: Date,
    timezone: string,
  ): Promise<BidanDashboardResponse> {
    if (actor.healthCenterId === null || actor.role !== "BIDAN") {
      return emptyBidanDashboard();
    }

    const villageResult = await this.pool.query<{
      readonly village_id: string;
      readonly village_name: string;
    }>(
      `SELECT village.id AS village_id, village.name AS village_name
         FROM staff_assignments AS assignment
         JOIN villages AS village
           ON assignment.scope_type = 'AREA'
          AND assignment.scope_id = village.id
        WHERE assignment.staff_user_id = $1
          AND assignment.revoked_at IS NULL
        ORDER BY village.name, village.id`,
      [actor.staffUserId],
    );

    const pregnancyRows = await this.listActivePregnancies(
      `p.health_center_id = $1
       AND EXISTS (
         SELECT 1
           FROM staff_assignments AS assignment
          WHERE assignment.staff_user_id = $2
            AND assignment.revoked_at IS NULL
            AND (
              (assignment.scope_type = 'MOTHER' AND assignment.scope_id = m.id)
              OR (
                assignment.scope_type = 'AREA'
                AND m.village_id IS NOT NULL
                AND assignment.scope_id = m.village_id
              )
            )
       )`,
      [actor.healthCenterId, actor.staffUserId],
    );
    const pregnancies = await this.derivePregnancies(pregnancyRows, now, timezone);
    const actionable = pregnancies
      .flatMap(({ row, milestones }) => milestones.map((milestone) => ({ row, milestone })))
      .filter(
        ({ milestone }) => milestone.visit_status === "DUE" || milestone.visit_status === "OVERDUE",
      );
    const dueCount = actionable.filter(({ milestone }) => milestone.visit_status === "DUE").length;
    const overdueCount = actionable.length - dueCount;

    const confirmationQueue: BidanConfirmationQueueItem[] = actionable
      .sort(compareDashboardMilestones)
      .slice(0, 10)
      .map(({ row, milestone }) => ({
        mother_id: row.mother_id,
        mother_full_name: row.mother_full_name,
        mother_phone_masked: maskPhone(row.phone_normalized),
        village_name: row.village_name,
        milestone_code: milestone.code,
        visit_status: milestone.visit_status,
        due_at: effectiveDueDate(milestone, timezone),
      }));

    return {
      summary: {
        assigned_mothers_count: new Set(pregnancies.map(({ row }) => row.mother_id)).size,
        milestones_due_count: dueCount,
        milestones_overdue_count: overdueCount,
        action_required_count: actionable.length,
      },
      assigned_villages: villageResult.rows,
      confirmation_queue: confirmationQueue,
    };
  }

  public async getBumilDashboard(
    actor: MotherActor,
    now: Date,
    timezone: string,
  ): Promise<BumilDashboardResponse> {
    const motherResult = await this.pool.query<{
      readonly id: string;
      readonly full_name: string;
      readonly address: string;
      readonly village_name: string | null;
      readonly health_center_name: string;
    }>(
      `SELECT mother.id, mother.full_name, mother.address,
              village.name AS village_name,
              center.name AS health_center_name
         FROM mothers AS mother
         JOIN health_centers AS center ON center.id = mother.health_center_id
         LEFT JOIN villages AS village ON village.id = mother.village_id
        WHERE mother.id = $1
        LIMIT 1`,
      [actor.motherId],
    );
    const mother = motherResult.rows[0];
    if (mother === undefined) return emptyBumilDashboard();

    const pregnancyRows = await this.listActivePregnancies(`m.id = $1`, [actor.motherId]);
    const pregnancy = (await this.derivePregnancies(pregnancyRows.slice(0, 1), now, timezone))[0];
    if (pregnancy === undefined) {
      return {
        mother_info: {
          full_name: mother.full_name,
          address: mother.address,
          village_name: mother.village_name,
        },
        active_pregnancy: null,
        next_milestone: null,
        milestones: [],
      };
    }

    const confirmationResult = await this.pool.query<{
      readonly milestone_id: string;
      readonly occurred_on: string | null;
    }>(
      `SELECT DISTINCT ON (confirmation.milestone_id)
              confirmation.milestone_id,
              confirmation.occurred_on::text AS occurred_on
         FROM visit_confirmations AS confirmation
         JOIN pregnancy_milestones AS milestone ON milestone.id = confirmation.milestone_id
        WHERE milestone.pregnancy_id = $1
        ORDER BY confirmation.milestone_id, confirmation.created_at DESC, confirmation.id DESC`,
      [pregnancy.row.pregnancy_id],
    );
    const occurredOnByMilestone = new Map(
      confirmationResult.rows.map((row) => [row.milestone_id, row.occurred_on] as const),
    );
    const nextMilestone = pregnancy.milestones.find(
      (milestone) => milestone.code === pregnancy.nextMilestoneCode,
    );

    return {
      mother_info: {
        full_name: mother.full_name,
        address: mother.address,
        village_name: mother.village_name,
      },
      active_pregnancy: {
        id: pregnancy.row.pregnancy_id,
        dating_date: pregnancy.snapshot.datingDate,
        completed_weeks: pregnancy.completedWeeks,
        completed_days: pregnancy.completedDays,
        trimester_label: pregnancy.trimesterLabel ?? "Belum ditetapkan",
        status: pregnancy.snapshot.pregnancyStatus,
      },
      next_milestone:
        nextMilestone === undefined
          ? null
          : {
              milestone_code: nextMilestone.code,
              visit_status: nextMilestone.visit_status,
              due_at: explicitDueDate(nextMilestone, timezone),
              expected_due_date: nextMilestone.target_date_end,
              recommended_facility_name: mother.health_center_name,
            },
      milestones: pregnancy.milestones.map((milestone) => ({
        milestone_code: milestone.code,
        visit_status: milestone.visit_status,
        record_validation_status: milestone.record_validation_status,
        due_at: explicitDueDate(milestone, timezone),
        occurred_on: occurredOnByMilestone.get(milestone.id) ?? null,
      })),
    };
  }

  private async listActivePregnancies(
    scopeSql: string,
    params: readonly unknown[],
  ): Promise<DashboardPregnancyRow[]> {
    const result = await this.pool.query<DashboardPregnancyRow>(
      `SELECT p.id AS pregnancy_id,
              m.id AS mother_id,
              m.full_name AS mother_full_name,
              m.phone_normalized,
              village.name AS village_name
         FROM pregnancies AS p
         JOIN mothers AS m ON m.id = p.mother_id
         LEFT JOIN villages AS village ON village.id = m.village_id
        WHERE p.status = 'ACTIVE' AND ${scopeSql}
        ORDER BY p.created_at DESC, p.id DESC`,
      [...params],
    );
    return result.rows;
  }

  private async derivePregnancies(
    rows: readonly DashboardPregnancyRow[],
    now: Date,
    timezone: string,
  ): Promise<DerivedDashboardPregnancy[]> {
    const derived = await Promise.all(
      rows.map(async (row): Promise<DerivedDashboardPregnancy | null> => {
        const snapshot = await this.planRepository.listPregnancyMilestones(row.pregnancy_id);
        if (snapshot === null) return null;
        const state = derivePregnancyMilestoneState(snapshot, now, timezone);
        return {
          row,
          snapshot,
          milestones: state.milestones,
          completedWeeks: state.gestational_age.completed_weeks,
          completedDays: state.gestational_age.additional_days,
          trimesterLabel: state.trimester_label,
          nextMilestoneCode: state.next_milestone_code,
        };
      }),
    );
    return derived.filter((item): item is DerivedDashboardPregnancy => item !== null);
  }
}

function explicitDueDate(milestone: PregnancyMilestoneResponse, timezone: string): string | null {
  return milestone.due_at === null
    ? null
    : dateOnlyInTimezone(new Date(milestone.due_at), timezone);
}

function effectiveDueDate(milestone: PregnancyMilestoneResponse, timezone: string): string | null {
  return explicitDueDate(milestone, timezone) ?? milestone.target_date_end;
}

function compareDashboardMilestones(
  left: { readonly milestone: PregnancyMilestoneResponse },
  right: { readonly milestone: PregnancyMilestoneResponse },
): number {
  const leftDate = left.milestone.target_date_end ?? "9999-12-31";
  const rightDate = right.milestone.target_date_end ?? "9999-12-31";
  return (
    leftDate.localeCompare(rightDate) || left.milestone.code.localeCompare(right.milestone.code)
  );
}

function emptyPuskesmasDashboard(): PuskesmasDashboardResponse {
  return {
    summary: {
      total_active_pregnancies: 0,
      milestones_due_count: 0,
      milestones_overdue_count: 0,
      pending_validations_count: 0,
      unresolved_wa_fallbacks_count: 0,
    },
    priority_action_queue: [],
  };
}

function emptyBidanDashboard(): BidanDashboardResponse {
  return {
    summary: {
      assigned_mothers_count: 0,
      milestones_due_count: 0,
      milestones_overdue_count: 0,
      action_required_count: 0,
    },
    assigned_villages: [],
    confirmation_queue: [],
  };
}

function emptyBumilDashboard(): BumilDashboardResponse {
  return {
    mother_info: { full_name: "", address: "", village_name: null },
    active_pregnancy: null,
    next_milestone: null,
    milestones: [],
  };
}
