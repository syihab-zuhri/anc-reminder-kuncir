import type { MilestoneCode, WaFallbackItem, WaFallbackStatus } from "@anc/contracts";
import type { DatabasePool } from "@anc/database";

import { maskPhone } from "../registry/mother-registry.repository.js";

export interface WaFallbackQueueScope {
  readonly healthCenterId: string;
  readonly actorStaffId: string;
  readonly role: "BIDAN" | "PUSKESMAS";
}

export interface WaFallbackLinkTarget {
  readonly status: WaFallbackStatus;
  readonly phoneNormalized: string;
  readonly milestoneCode: MilestoneCode;
  readonly linkGeneratedAt: Date | null;
  readonly templateVersionId: string;
  readonly templateBody: string;
  readonly facilityName: string;
}

export type WaFallbackTransitionResult = "UPDATED" | "NOT_FOUND" | "INVALID_STATE";

export interface WaFallbackRepository {
  getQueue(scope: WaFallbackQueueScope): Promise<WaFallbackItem[]>;
  getById(id: string): Promise<WaFallbackItem | null>;
  getScopeTarget(id: string): Promise<{ healthCenterId: string; motherId: string } | null>;
  getLinkTarget(id: string): Promise<WaFallbackLinkTarget | null>;
  markLinkGenerated(
    id: string,
    generatedAt: Date,
    templateVersionId: string,
    scope: WaFallbackQueueScope,
  ): Promise<WaFallbackTransitionResult>;
  markLinkOpened(
    id: string,
    openedAt: Date,
    scope: WaFallbackQueueScope,
  ): Promise<WaFallbackTransitionResult>;
  markResolved(
    id: string,
    staffUserId: string,
    manualNote: string | null,
    resolvedAt: Date,
    scope: WaFallbackQueueScope,
  ): Promise<WaFallbackTransitionResult>;
  markUnreachable(
    id: string,
    staffUserId: string,
    manualNote: string,
    occurredAt: Date,
    scope: WaFallbackQueueScope,
  ): Promise<WaFallbackTransitionResult>;
  canAccessMother(staffUserId: string, motherId: string): Promise<boolean>;
}

interface FallbackRow {
  readonly id: string;
  readonly reminder_cycle_id: string;
  readonly mother_id: string;
  readonly mother_full_name: string;
  readonly phone_normalized: string;
  readonly milestone_code: MilestoneCode;
  readonly due_at: Date | null;
  readonly status: WaFallbackStatus;
  readonly link_generated_at: Date | null;
  readonly link_opened_at: Date | null;
  readonly resolved_at: Date | null;
  readonly resolved_by: string | null;
  readonly manual_note: string | null;
}

// Bidan only see fallbacks for mothers they are assigned to (directly or via
// village/AREA scope); Puskesmas see their whole center.
const QUEUE_BASE_SQL = String.raw`
  SELECT
    wf.id,
    wf.reminder_cycle_id,
    wf.mother_id,
    m.full_name AS mother_full_name,
    m.phone_normalized,
    pm.code AS milestone_code,
    pm.due_at,
    wf.status,
    wf.link_generated_at,
    wf.link_opened_at,
    wf.resolved_at,
    wf.resolved_by,
    wf.manual_note
  FROM wa_fallback_actions wf
  JOIN mothers m ON wf.mother_id = m.id
  JOIN reminder_cycles rc ON wf.reminder_cycle_id = rc.id
  JOIN pregnancy_milestones pm ON rc.milestone_id = pm.id
`;

export class PostgresWaFallbackRepository implements WaFallbackRepository {
  public constructor(private readonly pool: DatabasePool) {}

  public async getQueue(scope: WaFallbackQueueScope): Promise<WaFallbackItem[]> {
    const result = await this.pool.query<FallbackRow>(
      `${QUEUE_BASE_SQL}
       WHERE wf.status IN ('READY', 'LINK_GENERATED', 'LINK_OPENED')
         AND m.health_center_id = $1
         AND (
           $2::staff_role = 'PUSKESMAS'
           OR EXISTS (
             SELECT 1 FROM staff_assignments a
             WHERE a.staff_user_id = $3
               AND a.revoked_at IS NULL
               AND (
                 (a.scope_type = 'MOTHER' AND a.scope_id = m.id)
                 OR (a.scope_type = 'AREA' AND m.village_id IS NOT NULL AND a.scope_id = m.village_id)
               )
           )
         )
       ORDER BY wf.status ASC, pm.due_at ASC NULLS LAST
       LIMIT 100`,
      [scope.healthCenterId, scope.role, scope.actorStaffId],
    );
    return result.rows.map(toItem);
  }

  public async getById(id: string): Promise<WaFallbackItem | null> {
    const result = await this.pool.query<FallbackRow>(
      `${QUEUE_BASE_SQL} WHERE wf.id = $1 LIMIT 1`,
      [id],
    );
    const row = result.rows[0];
    return row === undefined ? null : toItem(row);
  }

  public async getScopeTarget(
    id: string,
  ): Promise<{ healthCenterId: string; motherId: string } | null> {
    const result = await this.pool.query<{
      readonly health_center_id: string;
      readonly mother_id: string;
    }>(
      `SELECT m.health_center_id, wf.mother_id
         FROM wa_fallback_actions wf
         JOIN mothers m ON wf.mother_id = m.id
        WHERE wf.id = $1
        LIMIT 1`,
      [id],
    );
    const row = result.rows[0];
    if (row === undefined) return null;
    return { healthCenterId: row.health_center_id, motherId: row.mother_id };
  }

  public async getLinkTarget(id: string): Promise<WaFallbackLinkTarget | null> {
    const result = await this.pool.query<{
      readonly status: WaFallbackStatus;
      readonly phone_normalized: string;
      readonly milestone_code: MilestoneCode;
      readonly link_generated_at: Date | null;
      readonly template_version_id: string;
      readonly template_body: string;
      readonly facility_name: string;
    }>(
      `SELECT
         wf.status,
         m.phone_normalized,
         pm.code AS milestone_code,
         wf.link_generated_at,
         COALESCE(bound_version.id, selected_version.id) AS template_version_id,
         COALESCE(bound_version.body, selected_version.body) AS template_body,
         hc.name AS facility_name
         FROM wa_fallback_actions wf
         JOIN mothers m ON wf.mother_id = m.id
         JOIN health_centers hc ON hc.id = m.health_center_id
         JOIN reminder_cycles rc ON wf.reminder_cycle_id = rc.id
         JOIN pregnancy_milestones pm ON rc.milestone_id = pm.id
         LEFT JOIN content_versions bound_version ON bound_version.id = wf.template_version_id
         LEFT JOIN LATERAL (
           SELECT cv.id, cv.body
             FROM content_versions cv
             JOIN content_templates ct ON ct.id = cv.content_template_id
            WHERE ct.content_type = 'WAME_REMINDER'
              AND cv.status = 'PUBLISHED'
              AND (ct.health_center_id = m.health_center_id OR ct.health_center_id IS NULL)
            ORDER BY (ct.health_center_id = m.health_center_id) DESC, cv.published_at DESC
            LIMIT 1
         ) selected_version ON wf.template_version_id IS NULL
        WHERE wf.id = $1
          AND COALESCE(bound_version.id, selected_version.id) IS NOT NULL
        LIMIT 1`,
      [id],
    );
    const row = result.rows[0];
    if (row === undefined) return null;
    return {
      status: row.status,
      phoneNormalized: row.phone_normalized,
      milestoneCode: row.milestone_code,
      linkGeneratedAt: row.link_generated_at,
      templateVersionId: row.template_version_id,
      templateBody: row.template_body,
      facilityName: row.facility_name,
    };
  }

  public async markLinkGenerated(
    id: string,
    generatedAt: Date,
    templateVersionId: string,
    scope: WaFallbackQueueScope,
  ): Promise<WaFallbackTransitionResult> {
    return this.transition(
      `UPDATE wa_fallback_actions AS fallback
          SET status = 'LINK_GENERATED', link_generated_at = $2, template_version_id = $3
         FROM mothers AS mother
        WHERE fallback.id = $1
          AND fallback.status = 'READY'
          AND fallback.mother_id = mother.id
          AND mother.health_center_id = $4
          AND (
            $5::staff_role = 'PUSKESMAS'
            OR EXISTS (
              SELECT 1 FROM staff_assignments AS assignment
               WHERE assignment.staff_user_id = $6
                 AND assignment.revoked_at IS NULL
                 AND (
                   (assignment.scope_type = 'MOTHER' AND assignment.scope_id = mother.id)
                   OR (
                     assignment.scope_type = 'AREA'
                     AND mother.village_id IS NOT NULL
                     AND assignment.scope_id = mother.village_id
                   )
                 )
            )
          )`,
      [id, generatedAt, templateVersionId, scope.healthCenterId, scope.role, scope.actorStaffId],
      id,
    );
  }

  public async markLinkOpened(
    id: string,
    openedAt: Date,
    scope: WaFallbackQueueScope,
  ): Promise<WaFallbackTransitionResult> {
    return this.transition(
      `UPDATE wa_fallback_actions AS fallback
          SET status = 'LINK_OPENED', link_opened_at = $2
         FROM mothers AS mother
        WHERE fallback.id = $1
          AND fallback.status = 'LINK_GENERATED'
          AND fallback.mother_id = mother.id
          AND mother.health_center_id = $3
          AND (
            $4::staff_role = 'PUSKESMAS'
            OR EXISTS (
              SELECT 1 FROM staff_assignments AS assignment
               WHERE assignment.staff_user_id = $5
                 AND assignment.revoked_at IS NULL
                 AND (
                   (assignment.scope_type = 'MOTHER' AND assignment.scope_id = mother.id)
                   OR (
                     assignment.scope_type = 'AREA'
                     AND mother.village_id IS NOT NULL
                     AND assignment.scope_id = mother.village_id
                   )
                 )
            )
          )`,
      [id, openedAt, scope.healthCenterId, scope.role, scope.actorStaffId],
      id,
    );
  }

  public async markResolved(
    id: string,
    staffUserId: string,
    manualNote: string | null,
    resolvedAt: Date,
    scope: WaFallbackQueueScope,
  ): Promise<WaFallbackTransitionResult> {
    return this.transition(
      `UPDATE wa_fallback_actions AS fallback
          SET status = 'RESOLVED_MANUALLY',
              resolved_at = $2,
              resolved_by = $3,
              manual_note = $4
         FROM mothers AS mother
        WHERE fallback.id = $1
          AND fallback.status IN ('READY', 'LINK_GENERATED', 'LINK_OPENED')
          AND fallback.mother_id = mother.id
          AND mother.health_center_id = $5
          AND (
            $6::staff_role = 'PUSKESMAS'
            OR EXISTS (
              SELECT 1 FROM staff_assignments AS assignment
               WHERE assignment.staff_user_id = $7
                 AND assignment.revoked_at IS NULL
                 AND (
                   (assignment.scope_type = 'MOTHER' AND assignment.scope_id = mother.id)
                   OR (
                     assignment.scope_type = 'AREA'
                     AND mother.village_id IS NOT NULL
                     AND assignment.scope_id = mother.village_id
                   )
                 )
            )
          )`,
      [
        id,
        resolvedAt,
        staffUserId,
        manualNote,
        scope.healthCenterId,
        scope.role,
        scope.actorStaffId,
      ],
      id,
    );
  }

  public async markUnreachable(
    id: string,
    staffUserId: string,
    manualNote: string,
    occurredAt: Date,
    scope: WaFallbackQueueScope,
  ): Promise<WaFallbackTransitionResult> {
    return this.transition(
      `UPDATE wa_fallback_actions AS fallback
          SET status = 'UNREACHABLE',
              resolved_at = $2,
              resolved_by = $3,
              manual_note = $4,
              escalated_at = COALESCE(fallback.escalated_at, $2)
         FROM mothers AS mother
        WHERE fallback.id = $1
          AND fallback.status IN ('READY', 'LINK_GENERATED', 'LINK_OPENED')
          AND fallback.mother_id = mother.id
          AND mother.health_center_id = $5
          AND (
            $6::staff_role = 'PUSKESMAS'
            OR EXISTS (
              SELECT 1 FROM staff_assignments AS assignment
               WHERE assignment.staff_user_id = $7
                 AND assignment.revoked_at IS NULL
                 AND (
                   (assignment.scope_type = 'MOTHER' AND assignment.scope_id = mother.id)
                   OR (
                     assignment.scope_type = 'AREA'
                     AND mother.village_id IS NOT NULL
                     AND assignment.scope_id = mother.village_id
                   )
                 )
            )
          )`,
      [
        id,
        occurredAt,
        staffUserId,
        manualNote,
        scope.healthCenterId,
        scope.role,
        scope.actorStaffId,
      ],
      id,
    );
  }

  public async canAccessMother(staffUserId: string, motherId: string): Promise<boolean> {
    const result = await this.pool.query<{ readonly allowed: boolean }>(
      `SELECT EXISTS (
         SELECT 1
           FROM staff_assignments a
           JOIN mothers m ON m.id = $2
          WHERE a.staff_user_id = $1
            AND a.revoked_at IS NULL
            AND (
              (a.scope_type = 'MOTHER' AND a.scope_id = m.id)
              OR (a.scope_type = 'AREA' AND m.village_id IS NOT NULL AND a.scope_id = m.village_id)
            )
       ) AS allowed`,
      [staffUserId, motherId],
    );
    return result.rows[0]?.allowed === true;
  }

  private async transition(
    sql: string,
    params: unknown[],
    id: string,
  ): Promise<WaFallbackTransitionResult> {
    const updateResult = await this.pool.query(sql, params);
    if (updateResult.rowCount === 1) return "UPDATED";
    const existsResult = await this.pool.query<{ readonly status: WaFallbackStatus }>(
      `SELECT status FROM wa_fallback_actions WHERE id = $1 LIMIT 1`,
      [id],
    );
    return existsResult.rows[0] === undefined ? "NOT_FOUND" : "INVALID_STATE";
  }
}

function toItem(row: FallbackRow): WaFallbackItem {
  return {
    id: row.id,
    reminder_cycle_id: row.reminder_cycle_id,
    mother_id: row.mother_id,
    mother_full_name: row.mother_full_name,
    phone_number_masked: maskPhone(row.phone_normalized),
    milestone_code: row.milestone_code,
    due_at: row.due_at?.toISOString() ?? null,
    status: row.status,
    wa_me_url: null,
    link_generated_at: row.link_generated_at?.toISOString() ?? null,
    link_opened_at: row.link_opened_at?.toISOString() ?? null,
    resolved_at: row.resolved_at?.toISOString() ?? null,
    resolved_by: row.resolved_by,
    manual_note: row.manual_note,
  };
}
