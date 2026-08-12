import type { MilestoneCode, WaFallbackItem, WaFallbackStatus } from "@anc/contracts";
import type { DatabasePool } from "@anc/database";

export interface WaFallbackRepository {
  getQueue(scope: { healthCenterId?: string; villageIds?: string[] }): Promise<WaFallbackItem[]>;
  getById(id: string): Promise<WaFallbackItem | null>;
  updateWaLink(id: string, waMeUrl: string, generatedAt: string): Promise<WaFallbackItem | null>;
  resolve(id: string, staffUserId: string, manualNote?: string): Promise<WaFallbackItem | null>;
}

export class PostgresWaFallbackRepository implements WaFallbackRepository {
  public constructor(private readonly pool: DatabasePool) {}

  public async getQueue(scope: {
    healthCenterId?: string;
    villageIds?: string[];
  }): Promise<WaFallbackItem[]> {
    let whereClause = "WHERE wf.status IN ('READY', 'LINK_GENERATED')";
    const params: unknown[] = [];

    if (scope.healthCenterId !== undefined) {
      params.push(scope.healthCenterId);
      whereClause += ` AND m.health_center_id = $${params.length}`;
    }

    if (scope.villageIds !== undefined && scope.villageIds.length > 0) {
      params.push(scope.villageIds);
      whereClause += ` AND m.village_id = ANY($${params.length})`;
    }

    const sql = `
      SELECT 
        wf.id,
        wf.reminder_cycle_id,
        wf.mother_id,
        m.full_name AS mother_full_name,
        m.phone_number_masked,
        pm.milestone_code,
        pm.due_at,
        wf.status,
        wf.template_version_id,
        wf.link_generated_at,
        wf.resolved_at,
        wf.resolved_by,
        wf.manual_note
      FROM wa_fallback_actions wf
      JOIN mothers m ON wf.mother_id = m.id
      JOIN reminder_cycles rc ON wf.reminder_cycle_id = rc.id
      JOIN pregnancy_milestones pm ON rc.milestone_id = pm.id
      ${whereClause}
      ORDER BY wf.status ASC, pm.due_at ASC
      LIMIT 100;
    `;

    const res = await this.pool.query<{
      id: string;
      reminder_cycle_id: string;
      mother_id: string;
      mother_full_name: string;
      phone_number_masked: string;
      milestone_code: MilestoneCode;
      due_at: string | null;
      status: WaFallbackStatus;
      template_version_id: string | null;
      link_generated_at: string | null;
      resolved_at: string | null;
      resolved_by: string | null;
      manual_note: string | null;
    }>(sql, params);

    return res.rows.map((row) => ({
      id: row.id,
      reminder_cycle_id: row.reminder_cycle_id,
      mother_id: row.mother_id,
      mother_full_name: row.mother_full_name,
      phone_number_masked: row.phone_number_masked,
      milestone_code: row.milestone_code,
      due_at: row.due_at,
      status: row.status,
      wa_me_url: null,
      link_generated_at: row.link_generated_at,
      resolved_at: row.resolved_at,
      resolved_by: row.resolved_by,
      manual_note: row.manual_note,
    }));
  }

  public async getById(id: string): Promise<WaFallbackItem | null> {
    const sql = `
      SELECT 
        wf.id,
        wf.reminder_cycle_id,
        wf.mother_id,
        m.full_name AS mother_full_name,
        m.phone_number_masked,
        m.phone_number_encrypted,
        pm.milestone_code,
        pm.due_at,
        wf.status,
        wf.link_generated_at,
        wf.resolved_at,
        wf.resolved_by,
        wf.manual_note
      FROM wa_fallback_actions wf
      JOIN mothers m ON wf.mother_id = m.id
      JOIN reminder_cycles rc ON wf.reminder_cycle_id = rc.id
      JOIN pregnancy_milestones pm ON rc.milestone_id = pm.id
      WHERE wf.id = $1;
    `;

    const res = await this.pool.query<{
      id: string;
      reminder_cycle_id: string;
      mother_id: string;
      mother_full_name: string;
      phone_number_masked: string;
      milestone_code: MilestoneCode;
      due_at: string | null;
      status: WaFallbackStatus;
      link_generated_at: string | null;
      resolved_at: string | null;
      resolved_by: string | null;
      manual_note: string | null;
    }>(sql, [id]);

    const row = res.rows[0];
    if (row === undefined) return null;

    return {
      id: row.id,
      reminder_cycle_id: row.reminder_cycle_id,
      mother_id: row.mother_id,
      mother_full_name: row.mother_full_name,
      phone_number_masked: row.phone_number_masked,
      milestone_code: row.milestone_code,
      due_at: row.due_at,
      status: row.status,
      wa_me_url: null,
      link_generated_at: row.link_generated_at,
      resolved_at: row.resolved_at,
      resolved_by: row.resolved_by,
      manual_note: row.manual_note,
    };
  }

  public async updateWaLink(
    id: string,
    waMeUrl: string,
    generatedAt: string,
  ): Promise<WaFallbackItem | null> {
    const sql = `
      UPDATE wa_fallback_actions
      SET status = 'LINK_GENERATED', link_generated_at = $2::timestamptz
      WHERE id = $1
      RETURNING id;
    `;
    const res = await this.pool.query(sql, [id, generatedAt]);
    if (res.rows.length === 0) return null;
    return this.getById(id);
  }

  public async resolve(
    id: string,
    staffUserId: string,
    manualNote?: string,
  ): Promise<WaFallbackItem | null> {
    const sql = `
      UPDATE wa_fallback_actions
      SET status = 'RESOLVED', resolved_at = CURRENT_TIMESTAMP, resolved_by = $2, manual_note = $3
      WHERE id = $1
      RETURNING id;
    `;
    const res = await this.pool.query(sql, [id, staffUserId, manualNote ?? null]);
    if (res.rows.length === 0) return null;
    return this.getById(id);
  }
}
