import { Inject, Injectable } from "@nestjs/common";
import type {
  BidanDashboardResponse,
  BumilDashboardResponse,
  PriorityActionItem,
  PuskesmasDashboardResponse,
} from "@anc/contracts";
import type { DatabasePool } from "@anc/database";

import { deriveGestationalState } from "../anc-plan/anc-derived-state.js";
import type { MotherActor } from "../mother-access/mother-auth.types.js";
import type { StaffActor } from "../auth/staff-auth.types.js";
import { DATABASE_POOL } from "../infrastructure/tokens.js";
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

@Injectable()
export class PostgresDashboardRepository implements DashboardRepository {
  public constructor(@Inject(DATABASE_POOL) private readonly pool: DatabasePool) {}

  public async getPuskesmasDashboard(
    actor: StaffActor,
    now: Date,
    timezone: string,
  ): Promise<PuskesmasDashboardResponse> {
    if (actor.healthCenterId === null || actor.role !== "PUSKESMAS") {
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

    const todayStr = dateOnlyInTimezone(now, timezone);

    const activePregnanciesRes = await this.pool.query<{ count: string }>(
      `SELECT COUNT(*) as count FROM pregnancies WHERE health_center_id = $1 AND status = 'ACTIVE'`,
      [actor.healthCenterId],
    );
    const totalActivePregnancies = parseInt(activePregnanciesRes.rows[0]?.count ?? "0", 10);

    const dueRes = await this.pool.query<{ count: string }>(
      `SELECT COUNT(*) as count 
       FROM milestone_schedule ms
       JOIN pregnancies p ON ms.pregnancy_id = p.id
       WHERE p.health_center_id = $1 AND p.status = 'ACTIVE' AND ms.visit_status = 'DUE'`,
      [actor.healthCenterId],
    );
    const dueCount = parseInt(dueRes.rows[0]?.count ?? "0", 10);

    const overdueRes = await this.pool.query<{ count: string }>(
      `SELECT COUNT(*) as count 
       FROM milestone_schedule ms
       JOIN pregnancies p ON ms.pregnancy_id = p.id
       WHERE p.health_center_id = $1 AND p.status = 'ACTIVE' AND (ms.visit_status = 'OVERDUE' OR (ms.visit_status = 'DUE' AND ms.due_at < $2))`,
      [actor.healthCenterId, todayStr],
    );
    const overdueCount = parseInt(overdueRes.rows[0]?.count ?? "0", 10);

    const pendingValRes = await this.pool.query<{ count: string }>(
      `SELECT COUNT(*) as count 
       FROM milestone_schedule ms
       JOIN pregnancies p ON ms.pregnancy_id = p.id
       WHERE p.health_center_id = $1 AND p.status = 'ACTIVE' AND ms.visit_status = 'CONFIRMED' AND ms.record_validation_status = 'INCOMPLETE'`,
      [actor.healthCenterId],
    );
    const pendingValCount = parseInt(pendingValRes.rows[0]?.count ?? "0", 10);

    const queueRes = await this.pool.query<{
      mother_id: string;
      mother_full_name: string;
      village_name: string | null;
      milestone_code: "K1" | "K2" | "K3" | "K4" | "K5" | "K6" | "K7" | "K8";
      visit_status: "UPCOMING" | "DUE" | "OVERDUE" | "CONFIRMED" | "CANCELLED" | "NOT_APPLICABLE";
      due_at: string | null;
      record_validation_status: "NOT_REQUIRED" | "INCOMPLETE" | "VALIDATED";
    }>(
      `SELECT m.id as mother_id, m.full_name as mother_full_name, v.name as village_name,
              ms.milestone_code, ms.visit_status, ms.due_at, ms.record_validation_status
       FROM milestone_schedule ms
       JOIN pregnancies p ON ms.pregnancy_id = p.id
       JOIN mothers m ON p.mother_id = m.id
       LEFT JOIN villages v ON m.village_id = v.id
       WHERE p.health_center_id = $1 AND p.status = 'ACTIVE'
         AND (ms.visit_status IN ('DUE', 'OVERDUE') OR (ms.visit_status = 'CONFIRMED' AND ms.record_validation_status = 'INCOMPLETE'))
       ORDER BY ms.due_at ASC
       LIMIT 10`,
      [actor.healthCenterId],
    );

    const priorityActionQueue: PriorityActionItem[] = queueRes.rows.map((row) => {
      let actionType: "CONFIRMATION_NEEDED" | "VALIDATION_NEEDED" | "WA_FALLBACK_REQUIRED" =
        "CONFIRMATION_NEEDED";
      if (row.visit_status === "CONFIRMED" && row.record_validation_status === "INCOMPLETE") {
        actionType = "VALIDATION_NEEDED";
      } else if (row.visit_status === "OVERDUE") {
        actionType = "WA_FALLBACK_REQUIRED";
      }
      return {
        mother_id: row.mother_id,
        mother_full_name: row.mother_full_name,
        village_name: row.village_name,
        milestone_code: row.milestone_code,
        visit_status: row.visit_status,
        due_at: row.due_at,
        action_type: actionType,
      };
    });

    return {
      summary: {
        total_active_pregnancies: totalActivePregnancies,
        milestones_due_count: dueCount,
        milestones_overdue_count: overdueCount,
        pending_validations_count: pendingValCount,
        unresolved_wa_fallbacks_count: 0,
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

    const todayStr = dateOnlyInTimezone(now, timezone);

    const villageScopeRes = await this.pool.query<{ village_id: string; village_name: string }>(
      `SELECT v.id as village_id, v.name as village_name
       FROM staff_assignments sa
       JOIN villages v ON sa.village_id = v.id
       WHERE sa.staff_user_id = $1 AND sa.revoked_at IS NULL`,
      [actor.staffUserId],
    );
    const assignedVillages = villageScopeRes.rows.map((r) => ({
      village_id: r.village_id,
      village_name: r.village_name,
    }));
    const assignedVillageIds = assignedVillages.map((v) => v.village_id);

    const mothersRes = await this.pool.query<{ count: string }>(
      `SELECT COUNT(*) as count
       FROM mothers m
       JOIN pregnancies p ON p.mother_id = m.id
       WHERE p.health_center_id = $1 AND p.status = 'ACTIVE'
         AND (m.village_id = ANY($2::uuid[]) OR m.id IN (
           SELECT target_id FROM scoped_access_grants WHERE staff_user_id = $3 AND scope_type = 'MOTHER' AND revoked_at IS NULL
         ))`,
      [
        actor.healthCenterId,
        assignedVillageIds.length > 0 ? assignedVillageIds : [null],
        actor.staffUserId,
      ],
    );
    const assignedMothersCount = parseInt(mothersRes.rows[0]?.count ?? "0", 10);

    const dueRes = await this.pool.query<{ count: string }>(
      `SELECT COUNT(*) as count
       FROM milestone_schedule ms
       JOIN pregnancies p ON ms.pregnancy_id = p.id
       JOIN mothers m ON p.mother_id = m.id
       WHERE p.health_center_id = $1 AND p.status = 'ACTIVE' AND ms.visit_status = 'DUE'
         AND (m.village_id = ANY($2::uuid[]) OR m.id IN (
           SELECT target_id FROM scoped_access_grants WHERE staff_user_id = $3 AND scope_type = 'MOTHER' AND revoked_at IS NULL
         ))`,
      [
        actor.healthCenterId,
        assignedVillageIds.length > 0 ? assignedVillageIds : [null],
        actor.staffUserId,
      ],
    );
    const dueCount = parseInt(dueRes.rows[0]?.count ?? "0", 10);

    const overdueRes = await this.pool.query<{ count: string }>(
      `SELECT COUNT(*) as count
       FROM milestone_schedule ms
       JOIN pregnancies p ON ms.pregnancy_id = p.id
       JOIN mothers m ON p.mother_id = m.id
       WHERE p.health_center_id = $1 AND p.status = 'ACTIVE' AND (ms.visit_status = 'OVERDUE' OR (ms.visit_status = 'DUE' AND ms.due_at < $4))
         AND (m.village_id = ANY($2::uuid[]) OR m.id IN (
           SELECT target_id FROM scoped_access_grants WHERE staff_user_id = $3 AND scope_type = 'MOTHER' AND revoked_at IS NULL
         ))`,
      [
        actor.healthCenterId,
        assignedVillageIds.length > 0 ? assignedVillageIds : [null],
        actor.staffUserId,
        todayStr,
      ],
    );
    const overdueCount = parseInt(overdueRes.rows[0]?.count ?? "0", 10);

    const queueRes = await this.pool.query<{
      mother_id: string;
      mother_full_name: string;
      mother_phone_masked: string;
      village_name: string | null;
      milestone_code: "K1" | "K2" | "K3" | "K4" | "K5" | "K6" | "K7" | "K8";
      visit_status: "UPCOMING" | "DUE" | "OVERDUE" | "CONFIRMED" | "CANCELLED" | "NOT_APPLICABLE";
      due_at: string | null;
    }>(
      `SELECT m.id as mother_id, m.full_name as mother_full_name, m.phone_masked as mother_phone_masked,
              v.name as village_name, ms.milestone_code, ms.visit_status, ms.due_at
       FROM milestone_schedule ms
       JOIN pregnancies p ON ms.pregnancy_id = p.id
       JOIN mothers m ON p.mother_id = m.id
       LEFT JOIN villages v ON m.village_id = v.id
       WHERE p.health_center_id = $1 AND p.status = 'ACTIVE' AND ms.visit_status IN ('DUE', 'OVERDUE')
         AND (m.village_id = ANY($2::uuid[]) OR m.id IN (
           SELECT target_id FROM scoped_access_grants WHERE staff_user_id = $3 AND scope_type = 'MOTHER' AND revoked_at IS NULL
         ))
       ORDER BY ms.due_at ASC
       LIMIT 10`,
      [
        actor.healthCenterId,
        assignedVillageIds.length > 0 ? assignedVillageIds : [null],
        actor.staffUserId,
      ],
    );

    return {
      summary: {
        assigned_mothers_count: assignedMothersCount,
        milestones_due_count: dueCount,
        milestones_overdue_count: overdueCount,
        action_required_count: dueCount + overdueCount,
      },
      assigned_villages: assignedVillages,
      confirmation_queue: queueRes.rows,
    };
  }

  public async getBumilDashboard(actor: MotherActor, now: Date): Promise<BumilDashboardResponse> {
    const motherRes = await this.pool.query<{
      id: string;
      full_name: string;
      address: string;
      village_name: string | null;
    }>(
      `SELECT m.id, m.full_name, m.address, v.name as village_name
       FROM mothers m
       LEFT JOIN villages v ON m.village_id = v.id
       WHERE m.id = $1`,
      [actor.motherId],
    );
    const motherRow = motherRes.rows[0];
    if (!motherRow) {
      return {
        mother_info: { full_name: "", address: "", village_name: null },
        active_pregnancy: null,
        next_milestone: null,
        milestones: [],
      };
    }

    const pregRes = await this.pool.query<{
      id: string;
      dating_date: string;
      status: "ACTIVE" | "CLOSED";
    }>(
      `SELECT id, dating_date, status
       FROM pregnancies
       WHERE mother_id = $1 AND status = 'ACTIVE'
       ORDER BY created_at DESC
       LIMIT 1`,
      [actor.motherId],
    );
    const pregRow = pregRes.rows[0];

    if (!pregRow) {
      return {
        mother_info: {
          full_name: motherRow.full_name,
          address: motherRow.address,
          village_name: motherRow.village_name,
        },
        active_pregnancy: null,
        next_milestone: null,
        milestones: [],
      };
    }

    const datingDate = new Date(`${pregRow.dating_date}T00:00:00.000Z`);
    const gest = deriveGestationalState(datingDate, now);

    const milestonesRes = await this.pool.query<{
      milestone_code: "K1" | "K2" | "K3" | "K4" | "K5" | "K6" | "K7" | "K8";
      visit_status: "UPCOMING" | "DUE" | "OVERDUE" | "CONFIRMED" | "CANCELLED" | "NOT_APPLICABLE";
      record_validation_status: "NOT_REQUIRED" | "INCOMPLETE" | "VALIDATED";
      due_at: string | null;
      expected_due_date: string | null;
      occurred_on: string | null;
    }>(
      `SELECT milestone_code, visit_status, record_validation_status, due_at, expected_due_date, occurred_on
       FROM milestone_schedule
       WHERE pregnancy_id = $1
       ORDER BY milestone_code ASC`,
      [pregRow.id],
    );

    const milestones = milestonesRes.rows.map((r) => ({
      milestone_code: r.milestone_code,
      visit_status: r.visit_status,
      record_validation_status: r.record_validation_status,
      due_at: r.due_at,
      occurred_on: r.occurred_on,
    }));

    const nextRow = milestonesRes.rows.find((r) =>
      ["UPCOMING", "DUE", "OVERDUE"].includes(r.visit_status),
    );
    const nextMilestone = nextRow
      ? {
          milestone_code: nextRow.milestone_code,
          visit_status: nextRow.visit_status,
          due_at: nextRow.due_at,
          expected_due_date: nextRow.expected_due_date,
          recommended_facility_name: "Puskesmas Kuncir",
        }
      : null;

    return {
      mother_info: {
        full_name: motherRow.full_name,
        address: motherRow.address,
        village_name: motherRow.village_name,
      },
      active_pregnancy: {
        id: pregRow.id,
        dating_date: pregRow.dating_date,
        completed_weeks: gest.completedWeeks,
        completed_days: gest.completedDays,
        trimester_label: gest.trimesterLabel,
        status: pregRow.status,
      },
      next_milestone: nextMilestone,
      milestones,
    };
  }
}
