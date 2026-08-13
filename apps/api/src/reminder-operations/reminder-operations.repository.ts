import type {
  MilestoneCode,
  PushAttemptStatus,
  ReminderFailureKind,
  ReminderFallbackOperationalItem,
  ReminderSummaryResponse,
  WaFallbackStatus,
} from "@anc/contracts";
import type { DatabasePool } from "@anc/database";

import { maskPhone } from "../registry/mother-registry.repository.js";

interface SummaryRow {
  readonly active_cycles_count: number;
  readonly pending_push_attempts_count: number;
  readonly retryable_push_failures_count: number;
  readonly terminal_push_failures_count: number;
  readonly unresolved_fallbacks_count: number;
  readonly escalated_fallbacks_count: number;
  readonly unreachable_fallbacks_count: number;
  readonly oldest_pending_push_attempt_at: Date | null;
  readonly oldest_unresolved_fallback_at: Date | null;
}

interface QueueRow {
  readonly fallback_id: string;
  readonly reminder_cycle_id: string;
  readonly mother_id: string;
  readonly mother_full_name: string;
  readonly phone_normalized: string;
  readonly village_name: string | null;
  readonly milestone_code: MilestoneCode;
  readonly latest_push_attempt_status: PushAttemptStatus | null;
  readonly push_attempt_count: number;
  readonly fallback_status: WaFallbackStatus;
  readonly fallback_created_at: Date;
  readonly fallback_age_hours: number;
  readonly escalated: boolean;
}

export interface ReminderOperationsRepository {
  getSummary(
    healthCenterId: string,
    generatedAt: Date,
    fallbackSlaHours: number,
  ): Promise<ReminderSummaryResponse>;
}

export class PostgresReminderOperationsRepository implements ReminderOperationsRepository {
  public constructor(private readonly pool: DatabasePool) {}

  public async getSummary(
    healthCenterId: string,
    generatedAt: Date,
    fallbackSlaHours: number,
  ): Promise<ReminderSummaryResponse> {
    const cutoff = new Date(generatedAt.getTime() - fallbackSlaHours * 60 * 60 * 1_000);
    const [summaryResult, queueResult] = await Promise.all([
      this.pool.query<SummaryRow>(
        `SELECT
           COUNT(DISTINCT rc.id) FILTER (
             WHERE rc.status IN ('PENDING', 'PUSH_ATTEMPTING', 'WA_ACTION_REQUIRED', 'MANUAL_FOLLOWUP', 'ESCALATED')
           )::integer AS active_cycles_count,
           COUNT(DISTINCT latest_push.id) FILTER (
             WHERE latest_push.status = 'PENDING'
               AND rc.status IN ('PENDING', 'PUSH_ATTEMPTING', 'WA_ACTION_REQUIRED', 'MANUAL_FOLLOWUP', 'ESCALATED')
           )::integer AS pending_push_attempts_count,
           COUNT(DISTINCT latest_push.id) FILTER (
             WHERE latest_push.status = 'RETRYABLE_FAILURE'
               AND rc.status IN ('PENDING', 'PUSH_ATTEMPTING', 'WA_ACTION_REQUIRED', 'MANUAL_FOLLOWUP', 'ESCALATED')
           )::integer AS retryable_push_failures_count,
           COUNT(DISTINCT latest_push.id) FILTER (
             WHERE latest_push.status = 'TERMINAL_FAILURE'
               AND rc.status IN ('PENDING', 'PUSH_ATTEMPTING', 'WA_ACTION_REQUIRED', 'MANUAL_FOLLOWUP', 'ESCALATED')
           )::integer AS terminal_push_failures_count,
           COUNT(DISTINCT wf.id) FILTER (
             WHERE wf.status IN ('READY', 'LINK_GENERATED', 'LINK_OPENED')
           )::integer AS unresolved_fallbacks_count,
           COUNT(DISTINCT wf.id) FILTER (
             WHERE wf.status IN ('READY', 'LINK_GENERATED', 'LINK_OPENED')
               AND (wf.escalated_at IS NOT NULL OR rc.created_at <= $2)
           )::integer AS escalated_fallbacks_count,
           COUNT(DISTINCT wf.id) FILTER (WHERE wf.status = 'UNREACHABLE')::integer AS unreachable_fallbacks_count,
           MIN(latest_push.attempted_at) FILTER (
             WHERE latest_push.status = 'PENDING'
               AND rc.status IN ('PENDING', 'PUSH_ATTEMPTING', 'WA_ACTION_REQUIRED', 'MANUAL_FOLLOWUP', 'ESCALATED')
           ) AS oldest_pending_push_attempt_at,
           MIN(rc.created_at) FILTER (
             WHERE wf.status IN ('READY', 'LINK_GENERATED', 'LINK_OPENED')
           ) AS oldest_unresolved_fallback_at
         FROM reminder_cycles rc
         JOIN pregnancy_milestones pm ON pm.id = rc.milestone_id
         JOIN pregnancies p ON p.id = pm.pregnancy_id
         LEFT JOIN LATERAL (
           SELECT pa.id, pa.status, pa.attempted_at
             FROM push_attempts pa
            WHERE pa.reminder_cycle_id = rc.id
            ORDER BY pa.attempt_no DESC
            LIMIT 1
         ) latest_push ON true
         LEFT JOIN wa_fallback_actions wf ON wf.reminder_cycle_id = rc.id
        WHERE p.health_center_id = $1`,
        [healthCenterId, cutoff],
      ),
      this.pool.query<QueueRow>(
        `SELECT
           wf.id AS fallback_id,
           rc.id AS reminder_cycle_id,
           m.id AS mother_id,
           m.full_name AS mother_full_name,
           m.phone_normalized,
           v.name AS village_name,
           pm.code AS milestone_code,
           latest_push.status AS latest_push_attempt_status,
           COALESCE(push_counts.attempt_count, 0)::integer AS push_attempt_count,
           wf.status AS fallback_status,
           rc.created_at AS fallback_created_at,
           GREATEST(0, FLOOR(EXTRACT(EPOCH FROM ($2::timestamptz - rc.created_at)) / 3600))::integer
             AS fallback_age_hours,
           (
             wf.status = 'UNREACHABLE'
             OR wf.escalated_at IS NOT NULL
             OR rc.created_at <= $3
           ) AS escalated
         FROM wa_fallback_actions wf
         JOIN reminder_cycles rc ON rc.id = wf.reminder_cycle_id
         JOIN pregnancy_milestones pm ON pm.id = rc.milestone_id
         JOIN pregnancies p ON p.id = pm.pregnancy_id
         JOIN mothers m ON m.id = wf.mother_id
         LEFT JOIN villages v ON v.id = m.village_id
         LEFT JOIN LATERAL (
           SELECT pa.status
             FROM push_attempts pa
            WHERE pa.reminder_cycle_id = rc.id
            ORDER BY pa.attempt_no DESC
            LIMIT 1
         ) latest_push ON true
         LEFT JOIN LATERAL (
           SELECT COUNT(*)::integer AS attempt_count
             FROM push_attempts pa
            WHERE pa.reminder_cycle_id = rc.id
         ) push_counts ON true
        WHERE p.health_center_id = $1
          AND wf.status IN ('READY', 'LINK_GENERATED', 'LINK_OPENED', 'UNREACHABLE')
        ORDER BY
          (wf.status = 'UNREACHABLE' OR wf.escalated_at IS NOT NULL OR rc.created_at <= $3) DESC,
          rc.created_at ASC
        LIMIT 100`,
        [healthCenterId, generatedAt, cutoff],
      ),
    ]);

    const row = summaryResult.rows[0] ?? emptySummaryRow();
    return {
      generated_at: generatedAt.toISOString(),
      fallback_sla_hours: fallbackSlaHours,
      summary: {
        active_cycles_count: row.active_cycles_count,
        pending_push_attempts_count: row.pending_push_attempts_count,
        retryable_push_failures_count: row.retryable_push_failures_count,
        terminal_push_failures_count: row.terminal_push_failures_count,
        unresolved_fallbacks_count: row.unresolved_fallbacks_count,
        escalated_fallbacks_count: row.escalated_fallbacks_count,
        unreachable_fallbacks_count: row.unreachable_fallbacks_count,
      },
      oldest_pending_push_attempt_at: row.oldest_pending_push_attempt_at?.toISOString() ?? null,
      oldest_unresolved_fallback_at: row.oldest_unresolved_fallback_at?.toISOString() ?? null,
      fallback_queue: queueResult.rows.map(toOperationalItem),
      whatsapp_delivery_status: "UNKNOWN",
    };
  }
}

function toOperationalItem(row: QueueRow): ReminderFallbackOperationalItem {
  return {
    fallback_id: row.fallback_id,
    reminder_cycle_id: row.reminder_cycle_id,
    mother_id: row.mother_id,
    mother_full_name: row.mother_full_name,
    phone_number_masked: maskPhone(row.phone_normalized),
    village_name: row.village_name,
    milestone_code: row.milestone_code,
    push_failure_summary: toFailureKind(row.latest_push_attempt_status, row.push_attempt_count),
    latest_push_attempt_status: row.latest_push_attempt_status,
    push_attempt_count: row.push_attempt_count,
    fallback_status: row.fallback_status,
    fallback_created_at: row.fallback_created_at.toISOString(),
    fallback_age_hours: row.fallback_age_hours,
    escalated: row.escalated,
  };
}

function toFailureKind(
  latestStatus: PushAttemptStatus | null,
  attemptCount: number,
): ReminderFailureKind {
  if (latestStatus === "PENDING") return "PUSH_PENDING";
  if (latestStatus === "RETRYABLE_FAILURE") return "RETRYABLE_FAILURE";
  if (latestStatus === "TERMINAL_FAILURE") return "TERMINAL_FAILURE";
  if (attemptCount === 0) return "NO_ACTIVE_DEVICE";
  return "NO_PUSH_ATTEMPT";
}

function emptySummaryRow(): SummaryRow {
  return {
    active_cycles_count: 0,
    pending_push_attempts_count: 0,
    retryable_push_failures_count: 0,
    terminal_push_failures_count: 0,
    unresolved_fallbacks_count: 0,
    escalated_fallbacks_count: 0,
    unreachable_fallbacks_count: 0,
    oldest_pending_push_attempt_at: null,
    oldest_unresolved_fallback_at: null,
  };
}
