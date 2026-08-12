import { Inject, Injectable } from "@nestjs/common";
import type { OrganizationReportResponse, VillageReportItem } from "@anc/contracts";
import type { DatabasePool } from "@anc/database";

import { DATABASE_POOL } from "../infrastructure/tokens.js";

export interface ReportsRepository {
  getOrganizationSummary(healthCenterId: string, now: Date): Promise<OrganizationReportResponse>;
}

@Injectable()
export class PostgresReportsRepository implements ReportsRepository {
  public constructor(@Inject(DATABASE_POOL) private readonly pool: DatabasePool) {}

  public async getOrganizationSummary(
    healthCenterId: string,
    now: Date,
  ): Promise<OrganizationReportResponse> {
    const totalMothersRes = await this.pool.query<{ count: string }>(
      `SELECT COUNT(*) as count FROM mothers WHERE health_center_id = $1`,
      [healthCenterId],
    );
    const totalMothers = parseInt(totalMothersRes.rows[0]?.count ?? "0", 10);

    const totalActiveRes = await this.pool.query<{ count: string }>(
      `SELECT COUNT(*) as count FROM pregnancies WHERE health_center_id = $1 AND status = 'ACTIVE'`,
      [healthCenterId],
    );
    const totalActive = parseInt(totalActiveRes.rows[0]?.count ?? "0", 10);

    const totalConfirmedRes = await this.pool.query<{ count: string }>(
      `SELECT COUNT(*) as count 
       FROM pregnancy_milestones pm
       JOIN pregnancies p ON pm.pregnancy_id = p.id
       WHERE p.health_center_id = $1 AND pm.visit_status = 'CONFIRMED'`,
      [healthCenterId],
    );
    const totalConfirmed = parseInt(totalConfirmedRes.rows[0]?.count ?? "0", 10);

    const totalValidatedRes = await this.pool.query<{ count: string }>(
      `SELECT COUNT(*) as count 
       FROM k1_k6_records kr
       JOIN pregnancy_milestones pm ON kr.milestone_id = pm.id
       JOIN pregnancies p ON pm.pregnancy_id = p.id
       WHERE p.health_center_id = $1 AND kr.status = 'VALIDATED'`,
      [healthCenterId],
    );
    const totalValidated = parseInt(totalValidatedRes.rows[0]?.count ?? "0", 10);

    const villageBreakdownRes = await this.pool.query<{
      village_id: string | null;
      village_name: string | null;
      total_mothers: string;
      active_pregnancies: string;
      confirmed_visits: string;
      validated_records: string;
    }>(
      `SELECT 
         v.id as village_id,
         v.name as village_name,
         COUNT(DISTINCT m.id) as total_mothers,
         COUNT(DISTINCT CASE WHEN p.status = 'ACTIVE' THEN p.id END) as active_pregnancies,
         COUNT(DISTINCT CASE WHEN pm.visit_status = 'CONFIRMED' THEN pm.id END) as confirmed_visits,
         COUNT(DISTINCT CASE WHEN kr.status = 'VALIDATED' THEN kr.id END) as validated_records
       FROM villages v
       LEFT JOIN mothers m ON m.village_id = v.id AND m.health_center_id = $1
       LEFT JOIN pregnancies p ON p.mother_id = m.id
       LEFT JOIN pregnancy_milestones pm ON pm.pregnancy_id = p.id
       LEFT JOIN k1_k6_records kr ON kr.milestone_id = pm.id
       WHERE v.health_center_id = $1
       GROUP BY v.id, v.name
       ORDER BY v.name ASC`,
      [healthCenterId],
    );

    const villageBreakdown: VillageReportItem[] = villageBreakdownRes.rows.map((row) => ({
      village_id: row.village_id,
      village_name: row.village_name,
      total_mothers: parseInt(row.total_mothers, 10),
      active_pregnancies: parseInt(row.active_pregnancies, 10),
      confirmed_visits: parseInt(row.confirmed_visits, 10),
      validated_records: parseInt(row.validated_records, 10),
    }));

    return {
      health_center_id: healthCenterId,
      generated_at: now.toISOString(),
      total_mothers: totalMothers,
      total_active_pregnancies: totalActive,
      total_confirmed_visits: totalConfirmed,
      total_validated_records: totalValidated,
      village_breakdown: villageBreakdown,
    };
  }
}
