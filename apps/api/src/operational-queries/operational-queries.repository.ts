import { Inject, Injectable } from "@nestjs/common";
import type { DatabasePool } from "@anc/database";
import type {
  MilestoneCode,
  MotherDetailResponse,
  MotherListQuery,
  MotherListResponse,
  MotherSummary,
  OperationalMilestoneItem,
  OperationalMilestonesQuery,
  OperationalMilestonesResponse,
  PregnancyStatus,
  VisitStatus,
} from "@anc/contracts";

import type { StaffActor } from "../auth/staff-auth.types.js";
import { DATABASE_POOL } from "../infrastructure/tokens.js";
import { maskPhone } from "../registry/mother-registry.repository.js";
import { dateOnlyInTimezone } from "../registry/registry-validation.js";

export interface OperationalQueriesRepository {
  findMothers(
    actor: StaffActor,
    query: MotherListQuery,
    now: Date,
    timezone: string,
  ): Promise<MotherListResponse>;
  findMotherById(
    actor: StaffActor,
    motherId: string,
    now: Date,
    timezone: string,
  ): Promise<MotherDetailResponse | null>;
  findOperationalMilestones(
    actor: StaffActor,
    query: OperationalMilestonesQuery,
    now: Date,
    timezone: string,
  ): Promise<OperationalMilestonesResponse>;
}

interface MotherQueryResultRow {
  readonly id: string;
  readonly health_center_id: string;
  readonly full_name: string;
  readonly phone_normalized: string;
  readonly address: string;
  readonly village_id: string | null;
  readonly village_name: string | null;
  readonly created_at: Date;
  readonly active_pregnancy_id: string | null;
  readonly active_pregnancy_dating_date: string | null;
  readonly active_pregnancy_status: PregnancyStatus | null;
  readonly active_pregnancy_trimester_label: string | null;
}

interface MilestoneQueryResultRow {
  readonly milestone_id: string;
  readonly pregnancy_id: string;
  readonly mother_id: string;
  readonly mother_full_name: string;
  readonly mother_phone_normalized: string;
  readonly village_id: string | null;
  readonly village_name: string | null;
  readonly milestone_code: MilestoneCode;
  readonly visit_status: VisitStatus;
  readonly record_validation_status: "NOT_REQUIRED" | "INCOMPLETE" | "VALIDATED";
  readonly due_at: Date | null;
  readonly expected_due_date: string | null;
  readonly occurred_on: string | null;
  readonly dating_date: string;
  readonly trimester_label: string | null;
}

@Injectable()
export class PostgresOperationalQueriesRepository implements OperationalQueriesRepository {
  public constructor(@Inject(DATABASE_POOL) private readonly pool: DatabasePool) {}

  public async findMothers(
    actor: StaffActor,
    query: MotherListQuery,
    now: Date,
    timezone: string,
  ): Promise<MotherListResponse> {
    if (actor.healthCenterId === null || actor.role === "SUPER_ADMIN") {
      return { items: [], next_cursor: null, has_more: false };
    }

    const limit = query.limit;
    const fetchLimit = limit + 1;

    const parsedCursor = decodeMotherCursor(query.cursor);
    const asOfDate = dateOnlyInTimezone(now, timezone);

    const searchPattern = query.search ? `%${query.search}%` : null;

    const result = await this.pool.query<MotherQueryResultRow>(
      `SELECT
         m.id,
         m.health_center_id,
         m.full_name,
         m.phone_normalized,
         m.address,
         m.village_id,
         v.name AS village_name,
         m.created_at,
         p.id AS active_pregnancy_id,
         p.dating_date::text AS active_pregnancy_dating_date,
         p.status AS active_pregnancy_status,
         ${trimesterLabelSql("$10")} AS active_pregnancy_trimester_label
       FROM mothers m
       LEFT JOIN villages v ON v.id = m.village_id
       LEFT JOIN pregnancies p ON p.mother_id = m.id AND p.status = 'ACTIVE'
       WHERE m.health_center_id = $1
         AND m.archived_at IS NULL
         AND (
           $2::staff_role = 'PUSKESMAS'
           OR (
             $2::staff_role = 'BIDAN'
             AND EXISTS (
               SELECT 1 FROM staff_assignments a
               WHERE a.staff_user_id = $3
                 AND a.revoked_at IS NULL
                 AND (
                   (a.scope_type = 'MOTHER' AND a.scope_id = m.id)
                   OR (a.scope_type = 'AREA' AND m.village_id IS NOT NULL AND a.scope_id = m.village_id)
                 )
             )
           )
         )
         AND ($4::text IS NULL OR (m.full_name ILIKE $4 OR m.phone_normalized ILIKE $4))
         AND ($5::uuid IS NULL OR m.village_id = $5)
         AND ($6::pregnancy_status IS NULL OR (
           CASE
             WHEN $6::pregnancy_status = 'ACTIVE' THEN p.id IS NOT NULL
             WHEN $6::pregnancy_status = 'CLOSED' THEN p.id IS NULL AND EXISTS (SELECT 1 FROM pregnancies p2 WHERE p2.mother_id = m.id AND p2.status = 'CLOSED')
             ELSE TRUE
           END
         ))
         AND (
           $7::timestamptz IS NULL OR (
             m.created_at < $7 OR (m.created_at = $7 AND m.id < $8)
           )
         )
       ORDER BY m.created_at DESC, m.id DESC
       LIMIT $9`,
      [
        actor.healthCenterId,
        actor.role,
        actor.staffUserId,
        searchPattern,
        query.village_id ?? null,
        query.pregnancy_status ?? null,
        parsedCursor?.createdAt ?? null,
        parsedCursor?.id ?? null,
        fetchLimit,
        asOfDate,
      ],
    );

    const hasMore = result.rows.length > limit;
    const rows = hasMore ? result.rows.slice(0, limit) : result.rows;
    const items: MotherSummary[] = rows.map((row) => mapMotherRowToSummary(row, asOfDate));

    let nextCursor: string | null = null;
    if (hasMore && rows.length > 0) {
      const last = rows.at(-1)!;
      nextCursor = encodeMotherCursor(last.created_at, last.id);
    }

    return {
      items,
      next_cursor: nextCursor,
      has_more: hasMore,
    };
  }

  public async findMotherById(
    actor: StaffActor,
    motherId: string,
    now: Date,
    timezone: string,
  ): Promise<MotherDetailResponse | null> {
    if (actor.healthCenterId === null || actor.role === "SUPER_ADMIN") {
      return null;
    }
    const asOfDate = dateOnlyInTimezone(now, timezone);

    const result = await this.pool.query<MotherQueryResultRow>(
      `SELECT
         m.id,
         m.health_center_id,
         m.full_name,
         m.phone_normalized,
         m.address,
         m.village_id,
         v.name AS village_name,
         m.created_at,
         p.id AS active_pregnancy_id,
         p.dating_date::text AS active_pregnancy_dating_date,
         p.status AS active_pregnancy_status,
         ${trimesterLabelSql("$5")} AS active_pregnancy_trimester_label
       FROM mothers m
       LEFT JOIN villages v ON v.id = m.village_id
       LEFT JOIN pregnancies p ON p.mother_id = m.id AND p.status = 'ACTIVE'
       WHERE m.id = $1
         AND m.health_center_id = $2
         AND m.archived_at IS NULL
         AND (
           $3::staff_role = 'PUSKESMAS'
           OR (
             $3::staff_role = 'BIDAN'
             AND EXISTS (
               SELECT 1 FROM staff_assignments a
               WHERE a.staff_user_id = $4
                 AND a.revoked_at IS NULL
                 AND (
                   (a.scope_type = 'MOTHER' AND a.scope_id = m.id)
                   OR (a.scope_type = 'AREA' AND m.village_id IS NOT NULL AND a.scope_id = m.village_id)
                 )
             )
           )
         )`,
      [motherId, actor.healthCenterId, actor.role, actor.staffUserId, asOfDate],
    );

    if (result.rows.length === 0) return null;
    const row = result.rows[0]!;
    return {
      mother: mapMotherRowToSummary(row, asOfDate),
    };
  }

  public async findOperationalMilestones(
    actor: StaffActor,
    query: OperationalMilestonesQuery,
    now: Date,
    timezone: string,
  ): Promise<OperationalMilestonesResponse> {
    if (actor.healthCenterId === null || actor.role === "SUPER_ADMIN") {
      return { items: [], next_cursor: null, has_more: false };
    }

    const limit = query.limit;
    const fetchLimit = limit + 1;

    const parsedCursor = decodeMilestoneCursor(query.cursor);
    const asOfDate = dateOnlyInTimezone(now, timezone);

    const targetStartSql = String.raw`COALESCE(
      (pm.due_at AT TIME ZONE $12)::date,
      CASE
        WHEN rule.target_week_start IS NOT NULL
          THEN p.dating_date + (rule.target_week_start * 7)
        ELSE NULL
      END
    )`;
    const targetEndSql = String.raw`COALESCE(
      (pm.due_at AT TIME ZONE $12)::date,
      CASE
        WHEN rule.target_week_end IS NOT NULL
          THEN p.dating_date + (rule.target_week_end * 7 + 6)
        ELSE NULL
      END
    )`;
    const derivedVisitStatusSql = String.raw`CASE
      WHEN pm.visit_status IN ('CONFIRMED', 'CANCELLED', 'NOT_APPLICABLE')
        THEN pm.visit_status
      WHEN ${targetStartSql} IS NULL OR ${targetEndSql} IS NULL
        THEN 'UPCOMING'::visit_status
      WHEN $15::date < ${targetStartSql}
        THEN 'UPCOMING'::visit_status
      WHEN $15::date <= ${targetEndSql}
        THEN 'DUE'::visit_status
      ELSE 'OVERDUE'::visit_status
    END`;

    // expected_due_date = explicit due_at (localized) when scheduled, else the
    // rule-window end derived from pregnancy dating and the milestone rule.
    const result = await this.pool.query<MilestoneQueryResultRow>(
      `SELECT * FROM (
         SELECT
           pm.id AS milestone_id,
           pm.pregnancy_id,
           p.mother_id,
           m.full_name AS mother_full_name,
           m.phone_normalized AS mother_phone_normalized,
           m.village_id,
           v.name AS village_name,
           pm.code AS milestone_code,
           ${derivedVisitStatusSql} AS visit_status,
           pm.record_validation_status,
           pm.due_at,
           (${targetEndSql})::text AS expected_due_date,
           vc.occurred_on::text AS occurred_on,
           p.dating_date::text AS dating_date,
           COALESCE(
             (
               SELECT current_rule.trimester_label
                 FROM anc_milestone_rules AS current_rule
                WHERE current_rule.plan_version_id = pm.plan_version_id
                  AND current_rule.target_week_start IS NOT NULL
                  AND current_rule.target_week_end IS NOT NULL
                  AND (($15::date - p.dating_date) / 7)
                      BETWEEN current_rule.target_week_start AND current_rule.target_week_end
                ORDER BY current_rule.target_week_start DESC
                LIMIT 1
             ),
             (
               SELECT upcoming_rule.trimester_label
                 FROM anc_milestone_rules AS upcoming_rule
                WHERE upcoming_rule.plan_version_id = pm.plan_version_id
                  AND upcoming_rule.target_week_start > (($15::date - p.dating_date) / 7)
                ORDER BY upcoming_rule.target_week_start ASC
                LIMIT 1
             ),
             (
               SELECT latest_rule.trimester_label
                 FROM anc_milestone_rules AS latest_rule
                WHERE latest_rule.plan_version_id = pm.plan_version_id
                  AND latest_rule.target_week_end IS NOT NULL
                ORDER BY latest_rule.target_week_end DESC
                LIMIT 1
             )
           ) AS trimester_label
         FROM pregnancy_milestones pm
         JOIN pregnancies p ON p.id = pm.pregnancy_id
         JOIN anc_milestone_rules rule ON rule.id = pm.rule_id
         JOIN mothers m ON m.id = p.mother_id
         LEFT JOIN villages v ON v.id = m.village_id
         LEFT JOIN (
           SELECT DISTINCT ON (milestone_id) milestone_id, occurred_on
           FROM visit_confirmations
           ORDER BY milestone_id, created_at DESC
         ) vc ON vc.milestone_id = pm.id
         WHERE m.health_center_id = $1
           AND p.status = 'ACTIVE'
           AND (
             $2::staff_role = 'PUSKESMAS'
             OR (
               $2::staff_role = 'BIDAN'
               AND EXISTS (
                 SELECT 1 FROM staff_assignments a
                 WHERE a.staff_user_id = $3
                   AND a.revoked_at IS NULL
                   AND (
                     (a.scope_type = 'MOTHER' AND a.scope_id = m.id)
                     OR (a.scope_type = 'AREA' AND m.village_id IS NOT NULL AND a.scope_id = m.village_id)
                   )
               )
             )
           )
           AND ($4::visit_status IS NULL OR (${derivedVisitStatusSql}) = $4)
           AND ($5::milestone_code IS NULL OR pm.code = $5)
           AND ($6::uuid IS NULL OR m.village_id = $6)
       ) items
       WHERE ($7::date IS NULL OR items.expected_due_date::date >= $7)
         AND ($8::date IS NULL OR items.expected_due_date::date <= $8)
         AND (
           $14::boolean = false
           OR (
             $9::date IS NOT NULL
             AND (
               items.expected_due_date::date > $9
               OR items.expected_due_date IS NULL
               OR (
                 items.expected_due_date::date = $9
                 AND (
                   items.milestone_code > $10
                   OR (items.milestone_code = $10 AND items.milestone_id > $11)
                 )
               )
             )
           )
           OR (
             $9::date IS NULL
             AND items.expected_due_date IS NULL
             AND (
               items.milestone_code > $10
               OR (items.milestone_code = $10 AND items.milestone_id > $11)
             )
           )
         )
       ORDER BY items.expected_due_date::date ASC NULLS LAST, items.milestone_code ASC, items.milestone_id ASC
       LIMIT $13`,
      [
        actor.healthCenterId,
        actor.role,
        actor.staffUserId,
        query.status ?? null,
        query.milestone_code ?? null,
        query.village_id ?? null,
        query.due_date_from ?? null,
        query.due_date_to ?? null,
        parsedCursor?.dueDate ?? null,
        parsedCursor?.milestoneCode ?? null,
        parsedCursor?.id ?? null,
        timezone,
        fetchLimit,
        parsedCursor !== null,
        asOfDate,
      ],
    );

    const hasMore = result.rows.length > limit;
    const rows = hasMore ? result.rows.slice(0, limit) : result.rows;
    const items: OperationalMilestoneItem[] = rows.map((row) =>
      mapMilestoneRowToItem(row, asOfDate, timezone),
    );

    let nextCursor: string | null = null;
    if (hasMore && rows.length > 0) {
      const last = rows.at(-1)!;
      nextCursor = encodeMilestoneCursor(
        last.expected_due_date,
        last.milestone_code,
        last.milestone_id,
      );
    }

    return {
      items,
      next_cursor: nextCursor,
      has_more: hasMore,
    };
  }
}

function mapMotherRowToSummary(row: MotherQueryResultRow, asOfDate: string): MotherSummary {
  let activePregnancy = null;
  if (
    row.active_pregnancy_id !== null &&
    row.active_pregnancy_dating_date !== null &&
    row.active_pregnancy_status !== null
  ) {
    const totalDays = calendarDayDifference(row.active_pregnancy_dating_date, asOfDate);
    const completedWeeks = Math.floor(Math.max(0, totalDays) / 7);
    const completedDays = Math.max(0, totalDays) % 7;
    activePregnancy = {
      id: row.active_pregnancy_id,
      dating_date: row.active_pregnancy_dating_date,
      status: row.active_pregnancy_status,
      completed_weeks: completedWeeks,
      completed_days: completedDays,
      trimester_label: row.active_pregnancy_trimester_label ?? "Belum ditetapkan",
    };
  }

  return {
    id: row.id,
    health_center_id: row.health_center_id,
    full_name: row.full_name,
    phone_masked: maskPhone(row.phone_normalized),
    address: row.address,
    village_id: row.village_id,
    village_name: row.village_name,
    created_at: row.created_at.toISOString(),
    active_pregnancy: activePregnancy,
  };
}

function mapMilestoneRowToItem(
  row: MilestoneQueryResultRow,
  asOfDate: string,
  timezone: string,
): OperationalMilestoneItem {
  const totalDays = calendarDayDifference(row.dating_date, asOfDate);
  const completedWeeks = Math.floor(Math.max(0, totalDays) / 7);
  const completedDays = Math.max(0, totalDays) % 7;

  const dueAtDateOnly = row.due_at === null ? null : dateOnlyInTimezone(row.due_at, timezone);

  return {
    milestone_id: row.milestone_id,
    pregnancy_id: row.pregnancy_id,
    mother_id: row.mother_id,
    mother_full_name: row.mother_full_name,
    mother_phone_masked: maskPhone(row.mother_phone_normalized),
    village_id: row.village_id,
    village_name: row.village_name,
    milestone_code: row.milestone_code,
    visit_status: row.visit_status,
    record_validation_status: row.record_validation_status,
    due_at: dueAtDateOnly,
    expected_due_date: row.expected_due_date,
    occurred_on: row.occurred_on,
    completed_weeks: completedWeeks,
    completed_days: completedDays,
    trimester_label: row.trimester_label ?? "Belum ditetapkan",
  };
}

function calendarDayDifference(startDate: string, endDate: string): number {
  return Math.trunc((dateOnlyToEpoch(endDate) - dateOnlyToEpoch(startDate)) / 86_400_000);
}

function trimesterLabelSql(asOfParameter: "$5" | "$10"): string {
  const completedWeeks = `GREATEST(0, (${asOfParameter}::date - p.dating_date) / 7)`;
  return String.raw`COALESCE(
    (
      SELECT current_rule.trimester_label
        FROM anc_milestone_rules AS current_rule
       WHERE current_rule.plan_version_id = p.care_plan_version_id
         AND current_rule.target_week_start IS NOT NULL
         AND current_rule.target_week_end IS NOT NULL
         AND ${completedWeeks} BETWEEN current_rule.target_week_start AND current_rule.target_week_end
       ORDER BY current_rule.target_week_start DESC
       LIMIT 1
    ),
    (
      SELECT upcoming_rule.trimester_label
        FROM anc_milestone_rules AS upcoming_rule
       WHERE upcoming_rule.plan_version_id = p.care_plan_version_id
         AND upcoming_rule.target_week_start > ${completedWeeks}
       ORDER BY upcoming_rule.target_week_start ASC
       LIMIT 1
    ),
    (
      SELECT latest_rule.trimester_label
        FROM anc_milestone_rules AS latest_rule
       WHERE latest_rule.plan_version_id = p.care_plan_version_id
         AND latest_rule.target_week_end IS NOT NULL
       ORDER BY latest_rule.target_week_end DESC
       LIMIT 1
    )
  )`;
}

function dateOnlyToEpoch(date: string): number {
  return Date.parse(`${date}T00:00:00.000Z`);
}

function encodeMotherCursor(createdAt: Date, id: string): string {
  return Buffer.from(JSON.stringify({ createdAt: createdAt.toISOString(), id })).toString(
    "base64url",
  );
}

function decodeMotherCursor(
  cursor?: string,
): { readonly createdAt: Date; readonly id: string } | null {
  if (!cursor) return null;
  try {
    const raw = Buffer.from(cursor, "base64url").toString("utf8");
    const parsed = JSON.parse(raw) as { createdAt?: string; id?: string };
    if (typeof parsed.createdAt === "string" && typeof parsed.id === "string") {
      const createdAt = new Date(parsed.createdAt);
      if (!Number.isNaN(createdAt.getTime())) {
        return { createdAt, id: parsed.id };
      }
    }
  } catch {
    // Ignore invalid cursor format safely
  }
  return null;
}

function encodeMilestoneCursor(
  dueDate: string | null,
  milestoneCode: MilestoneCode,
  id: string,
): string {
  return Buffer.from(JSON.stringify({ dueDate, milestoneCode, id })).toString("base64url");
}

function decodeMilestoneCursor(cursor?: string): {
  readonly dueDate: string | null;
  readonly milestoneCode: MilestoneCode;
  readonly id: string;
} | null {
  if (!cursor) return null;
  try {
    const raw = Buffer.from(cursor, "base64url").toString("utf8");
    const parsed = JSON.parse(raw) as {
      dueDate?: string | null;
      milestoneCode?: string;
      id?: string;
    };
    if (
      typeof parsed.id === "string" &&
      typeof parsed.milestoneCode === "string" &&
      /^K[1-8]$/u.test(parsed.milestoneCode)
    ) {
      return {
        dueDate: parsed.dueDate ?? null,
        milestoneCode: parsed.milestoneCode as MilestoneCode,
        id: parsed.id,
      };
    }
  } catch {
    // Ignore invalid cursor format safely
  }
  return null;
}
