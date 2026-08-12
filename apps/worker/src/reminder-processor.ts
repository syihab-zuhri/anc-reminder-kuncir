import type { DatabasePool } from "@anc/database";

export interface ReminderProcessingResult {
  readonly createdCyclesCount: number;
  readonly pushAttemptsCount: number;
  readonly waFallbackActionsCount: number;
}

export async function processReminderCycles(
  pool: DatabasePool,
  anchorDateStr?: string,
): Promise<ReminderProcessingResult> {
  const targetDate = anchorDateStr ?? new Date().toISOString().slice(0, 10);

  // 1. Query due/overdue milestones from ACTIVE pregnancies where REMINDER consent is GRANTED
  const query = `
    SELECT 
      pm.id AS milestone_id,
      p.mother_id AS mother_id,
      pm.due_at AS due_at
    FROM pregnancy_milestones pm
    JOIN pregnancies p ON pm.pregnancy_id = p.id
    JOIN mothers m ON p.mother_id = m.id
    JOIN consent_records c ON m.id = c.mother_id
    LEFT JOIN reminder_cycles rc 
      ON rc.milestone_id = pm.id 
     AND DATE(rc.cycle_anchor_at) = DATE($1::timestamptz)
    WHERE p.status = 'ACTIVE'
      AND pm.visit_status IN ('DUE', 'OVERDUE')
      AND c.purpose = 'REMINDER'
      AND c.status = 'GRANTED'
      AND rc.id IS NULL
    LIMIT 500;
  `;

  const client = await pool.connect();
  try {
    await client.query("BEGIN;");
    const res = await client.query<{ milestone_id: string; mother_id: string; due_at: string }>(
      query,
      [targetDate],
    );

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
          created_at
        ) VALUES ($1, $2, $3::timestamptz, 'PENDING', $4, CURRENT_TIMESTAMP)
        ON CONFLICT (milestone_id, cycle_anchor_at) DO NOTHING
        RETURNING id;
        `,
        [cycleId, row.milestone_id, targetDate, idempotencyKey],
      );

      if ((cycleRes.rowCount ?? 0) === 0) {
        // Already created by concurrent run or previous cycle
        continue;
      }
      createdCycles++;

      // Check if active device exists for FCM push
      const deviceRes = await client.query<{ id: string }>(
        `
        SELECT id FROM devices 
        WHERE mother_id = $1 AND status = 'ACTIVE' 
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
            attempted_at
          ) VALUES ($1, $2, 1, 'PENDING', CURRENT_TIMESTAMP)
          ON CONFLICT (reminder_cycle_id, attempt_no) DO NOTHING;
          `,
          [pushAttemptId, cycleId],
        );
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
            status
          ) VALUES ($1, $2, $3, 'READY')
          ON CONFLICT (reminder_cycle_id) DO NOTHING;
          `,
          [waFallbackId, cycleId, row.mother_id],
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
