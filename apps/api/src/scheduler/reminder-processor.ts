import type { DatabasePool } from "@anc/database";

export interface ReminderProcessingResult {
  readonly createdCyclesCount: number;
  readonly pushAttemptsCount: number;
  readonly waFallbackActionsCount: number;
}

export interface ReminderCycleProcessingOptions {
  readonly intervalDays?: number;
  readonly timezone?: string;
}

const defaultIntervalDays = 3;
const defaultTimezone = "Asia/Jakarta";

/**
 * Returns the calendar date (YYYY-MM-DD) that `date` falls on inside the given
 * IANA time zone. UTC date must never be used as the cycle anchor because it
 * can shift a reminder one day early or late around local midnight (NFR-009).
 */
export function localDateString(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const value = (type: string): string => parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

export async function processReminderCycles(
  pool: DatabasePool,
  anchorDateStr?: string,
  options: ReminderCycleProcessingOptions = {},
): Promise<ReminderProcessingResult> {
  const intervalDays = options.intervalDays ?? defaultIntervalDays;
  const timezone = options.timezone ?? defaultTimezone;
  const targetDate = anchorDateStr ?? localDateString(new Date(), timezone);

  // 1. Query due/overdue milestones from ACTIVE pregnancies where REMINDER consent is GRANTED
  const query = `
    SELECT 
      pm.id AS milestone_id,
      p.mother_id AS mother_id,
      p.health_center_id AS health_center_id,
      pm.due_at AS due_at
    FROM pregnancy_milestones pm
    JOIN pregnancies p ON pm.pregnancy_id = p.id
    JOIN mothers m ON p.mother_id = m.id
    JOIN LATERAL (
      SELECT status
        FROM consent_records
       WHERE mother_id = m.id AND purpose = 'REMINDER'
       ORDER BY recorded_at DESC, id DESC
       LIMIT 1
    ) c ON true
    LEFT JOIN reminder_cycles rc 
      ON rc.milestone_id = pm.id 
     AND DATE(rc.cycle_anchor_at) = DATE($1::timestamptz)
    WHERE p.status = 'ACTIVE'
      AND pm.visit_status IN ('DUE', 'OVERDUE')
      AND c.status = 'GRANTED'
      AND rc.id IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM reminder_cycles last_rc
         WHERE last_rc.milestone_id = pm.id
           AND last_rc.status <> 'CANCELLED'
           AND last_rc.cycle_anchor_at >= $1::timestamptz - make_interval(days => $2)
      )
    LIMIT 500;
  `;

  const client = await pool.connect();
  try {
    await client.query("BEGIN;");
    const res = await client.query<{
      milestone_id: string;
      mother_id: string;
      health_center_id: string;
      due_at: string;
    }>(query, [targetDate, intervalDays]);

    let createdCycles = 0;
    let pushAttempts = 0;
    let waFallbacks = 0;

    for (const row of res.rows) {
      const cycleId = crypto.randomUUID();
      const idempotencyKey = `rem_cycle_${row.milestone_id}_${targetDate}`;

      // Insert reminder cycle
      const cycleRes = await client.query(
        `
        INSERT INTO reminder_cycles (
          id,
          milestone_id,
          cycle_anchor_at,
          status,
          idempotency_key,
          push_template_version_id,
          created_at
        ) VALUES (
          $1,
          $2,
          $3::timestamptz,
          'PENDING',
          $4,
          (
            SELECT cv.id
              FROM content_versions cv
              JOIN content_templates ct ON ct.id = cv.content_template_id
             WHERE ct.content_type = 'PUSH_REMINDER'
               AND cv.status = 'PUBLISHED'
               AND (ct.health_center_id = $5 OR ct.health_center_id IS NULL)
             ORDER BY (ct.health_center_id = $5) DESC, cv.published_at DESC
             LIMIT 1
          ),
          CURRENT_TIMESTAMP
        )
        ON CONFLICT (milestone_id, cycle_anchor_at) DO NOTHING
        RETURNING id;
        `,
        [cycleId, row.milestone_id, targetDate, idempotencyKey, row.health_center_id],
      );

      if ((cycleRes.rowCount ?? 0) === 0) {
        // Already created by concurrent run or previous cycle
        continue;
      }
      createdCycles++;

      // Check if an Android device exists for FCM push
      const deviceRes = await client.query<{ id: string }>(
        `
        SELECT id FROM devices 
        WHERE mother_id = $1 AND platform = 'ANDROID' AND status = 'ACTIVE' 
        LIMIT 1;
        `,
        [row.mother_id],
      );

      if ((deviceRes.rowCount ?? 0) > 0) {
        // Record PENDING push attempt
        const pushAttemptId = crypto.randomUUID();
        await client.query(
          `
          INSERT INTO push_attempts (
            id,
            reminder_cycle_id,
            attempt_no,
            status,
            attempted_at,
            scheduled_for
          ) VALUES ($1, $2, 1, 'PENDING', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
          ON CONFLICT (reminder_cycle_id, attempt_no) DO NOTHING;
          `,
          [pushAttemptId, cycleId],
        );
        await client.query(`UPDATE reminder_cycles SET status = 'PUSH_ATTEMPTING' WHERE id = $1`, [
          cycleId,
        ]);
        pushAttempts++;
      } else {
        // Fallback directly to WA manual action queue
        const waFallbackId = crypto.randomUUID();
        await client.query(
          `
          INSERT INTO wa_fallback_actions (
            id,
            reminder_cycle_id,
            mother_id,
            template_version_id,
            status
          ) VALUES (
            $1,
            $2,
            $3,
            (
              SELECT cv.id
                FROM content_versions cv
                JOIN content_templates ct ON ct.id = cv.content_template_id
               WHERE ct.content_type = 'WAME_REMINDER'
                 AND cv.status = 'PUBLISHED'
                 AND (ct.health_center_id = $4 OR ct.health_center_id IS NULL)
               ORDER BY (ct.health_center_id = $4) DESC, cv.published_at DESC
               LIMIT 1
            ),
            'READY'
          )
          ON CONFLICT (reminder_cycle_id) DO NOTHING;
          `,
          [waFallbackId, cycleId, row.mother_id, row.health_center_id],
        );
        await client.query(
          `UPDATE reminder_cycles SET status = 'WA_ACTION_REQUIRED' WHERE id = $1`,
          [cycleId],
        );
        waFallbacks++;
      }
    }

    await client.query("COMMIT;");
    return {
      createdCyclesCount: createdCycles,
      pushAttemptsCount: pushAttempts,
      waFallbackActionsCount: waFallbacks,
    };
  } catch (err) {
    await client.query("ROLLBACK;").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
