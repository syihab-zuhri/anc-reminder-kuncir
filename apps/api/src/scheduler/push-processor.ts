import type { PushAttemptStatus } from "@anc/contracts";
import type { DatabasePool, DeviceTokenCrypto } from "@anc/database";

import type { PushDeliveryAdapter, PushDeliveryResult } from "./push-adapter.js";

const leaseMinutes = 5;

interface ClaimedPushAttempt {
  readonly attempt_id: string;
  readonly reminder_cycle_id: string;
  readonly attempt_no: number;
  readonly device_id: string | null;
  readonly push_token_encrypted: string | null;
  readonly title: string | null;
  readonly body: string | null;
  readonly milestone_code: string;
  readonly facility_name: string;
  readonly mother_id: string;
  readonly health_center_id: string;
}

export interface PushRetryPolicy {
  readonly maxAttempts: number;
  readonly backoffSeconds: readonly number[];
}

export interface PushProcessingResult {
  readonly processedAttemptsCount: number;
  readonly succeededCount: number;
  readonly retriesScheduledCount: number;
  readonly terminalFailuresCount: number;
  readonly waFallbackActionsCount: number;
}

export interface ProcessPushAttemptsOptions {
  readonly now?: Date;
  readonly maxJobs?: number;
  readonly random?: () => number;
}

export async function processPendingPushAttempts(
  pool: DatabasePool,
  adapter: PushDeliveryAdapter,
  tokenCrypto: DeviceTokenCrypto,
  retryPolicy: PushRetryPolicy,
  options: ProcessPushAttemptsOptions = {},
): Promise<PushProcessingResult> {
  const now = options.now ?? new Date();
  const maxJobs = options.maxJobs ?? 100;
  const random = options.random ?? Math.random;
  const counters = {
    processedAttemptsCount: 0,
    succeededCount: 0,
    retriesScheduledCount: 0,
    terminalFailuresCount: 0,
    waFallbackActionsCount: 0,
  };

  for (let index = 0; index < maxJobs; index += 1) {
    const attempt = await claimNextAttempt(pool, now);
    if (attempt === null) break;

    const delivery = await deliver(attempt, adapter, tokenCrypto);
    const outcome = await finalizeAttempt(pool, attempt, delivery, retryPolicy, now, random);
    counters.processedAttemptsCount += 1;
    if (delivery.status === "SUCCESS") counters.succeededCount += 1;
    if (outcome.retryScheduled) counters.retriesScheduledCount += 1;
    if (outcome.terminal) counters.terminalFailuresCount += 1;
    if (outcome.fallbackCreated) counters.waFallbackActionsCount += 1;
  }

  return counters;
}

async function claimNextAttempt(pool: DatabasePool, now: Date): Promise<ClaimedPushAttempt | null> {
  const result = await pool.query<ClaimedPushAttempt>(
    `WITH candidate AS (
       SELECT pa.id
         FROM push_attempts pa
         JOIN reminder_cycles rc ON rc.id = pa.reminder_cycle_id
        WHERE pa.status = 'PENDING'
          AND pa.scheduled_for <= $1
          AND (pa.lease_expires_at IS NULL OR pa.lease_expires_at <= $1)
          AND rc.status IN ('PENDING', 'PUSH_ATTEMPTING')
        ORDER BY pa.scheduled_for, pa.attempt_no, pa.id
        FOR UPDATE OF pa SKIP LOCKED
        LIMIT 1
     ), claimed AS (
       UPDATE push_attempts pa
          SET claimed_at = $1,
              lease_expires_at = $1 + make_interval(mins => $2),
              attempted_at = $1
         FROM candidate
        WHERE pa.id = candidate.id
        RETURNING pa.id, pa.reminder_cycle_id, pa.attempt_no
     )
     SELECT claimed.id AS attempt_id,
            claimed.reminder_cycle_id,
            claimed.attempt_no,
            device.id AS device_id,
            device.push_token_encrypted,
            content.title,
            content.body,
            milestone.milestone_code::text,
            center.name AS facility_name,
            pregnancy.mother_id,
            pregnancy.health_center_id
       FROM claimed
       JOIN reminder_cycles cycle ON cycle.id = claimed.reminder_cycle_id
       JOIN pregnancy_milestones milestone ON milestone.id = cycle.milestone_id
       JOIN pregnancies pregnancy ON pregnancy.id = milestone.pregnancy_id
       JOIN health_centers center ON center.id = pregnancy.health_center_id
       LEFT JOIN content_versions content ON content.id = cycle.push_template_version_id
       LEFT JOIN LATERAL (
         SELECT id, push_token_encrypted
           FROM devices
          WHERE mother_id = pregnancy.mother_id
            AND platform = 'ANDROID'
            AND status = 'ACTIVE'
          ORDER BY updated_at DESC, id
          LIMIT 1
       ) device ON true`,
    [now, leaseMinutes],
  );
  return result.rows[0] ?? null;
}

async function deliver(
  attempt: ClaimedPushAttempt,
  adapter: PushDeliveryAdapter,
  tokenCrypto: DeviceTokenCrypto,
): Promise<PushDeliveryResult> {
  if (attempt.device_id === null || attempt.push_token_encrypted === null) {
    return terminal("NO_ACTIVE_DEVICE", false);
  }
  if (attempt.title === null || attempt.body === null) {
    return terminal("MISSING_PUSH_TEMPLATE", false);
  }

  let token: string;
  try {
    token = tokenCrypto.decrypt(attempt.push_token_encrypted);
  } catch {
    return terminal("DEVICE_TOKEN_DECRYPTION_FAILED", true);
  }
  return adapter.send({
    token,
    title: renderApprovedTemplate(attempt.title, attempt),
    body: renderApprovedTemplate(attempt.body, attempt),
    reminderCycleId: attempt.reminder_cycle_id,
    milestoneCode: attempt.milestone_code,
  });
}

async function finalizeAttempt(
  pool: DatabasePool,
  attempt: ClaimedPushAttempt,
  delivery: PushDeliveryResult,
  retryPolicy: PushRetryPolicy,
  now: Date,
  random: () => number,
): Promise<{
  readonly retryScheduled: boolean;
  readonly terminal: boolean;
  readonly fallbackCreated: boolean;
}> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const status: PushAttemptStatus = delivery.status;
    const completed = await client.query(
      `UPDATE push_attempts
          SET status = $2,
              provider_message_id = $3,
              error_code = $4,
              completed_at = $5,
              claimed_at = NULL,
              lease_expires_at = NULL,
              device_id = COALESCE(device_id, $6)
        WHERE id = $1 AND status = 'PENDING' AND claimed_at = $5`,
      [
        attempt.attempt_id,
        status,
        delivery.status === "SUCCESS" ? delivery.providerMessageId : null,
        delivery.status === "SUCCESS" ? null : delivery.errorCode,
        now,
        attempt.device_id,
      ],
    );
    if ((completed.rowCount ?? 0) === 0) {
      await client.query("ROLLBACK");
      return { retryScheduled: false, terminal: false, fallbackCreated: false };
    }

    if (delivery.status === "SUCCESS") {
      await client.query(
        `UPDATE reminder_cycles
            SET status = 'PUSH_SUCCEEDED', closed_at = $2
          WHERE id = $1 AND status <> 'CANCELLED'`,
        [attempt.reminder_cycle_id, now],
      );
      await client.query("COMMIT");
      return { retryScheduled: false, terminal: false, fallbackCreated: false };
    }

    const canRetry =
      delivery.status === "RETRYABLE_FAILURE" && attempt.attempt_no < retryPolicy.maxAttempts;
    if (canRetry) {
      const nextAttemptNo = attempt.attempt_no + 1;
      const configuredDelay = retryDelaySeconds(retryPolicy.backoffSeconds, attempt.attempt_no);
      const providerDelay = delivery.retryAfterSeconds ?? 0;
      // FCM recommends a minimum one-minute initial delay for rejected sends.
      const baseDelay = Math.max(60, configuredDelay, providerDelay);
      const jitteredDelay = Math.ceil(baseDelay * (1 + Math.max(0, random()) * 0.2));
      const scheduledFor = new Date(now.getTime() + jitteredDelay * 1000);
      const inserted = await client.query(
        `INSERT INTO push_attempts (
         id, reminder_cycle_id, attempt_no, status, attempted_at, scheduled_for
         )
         SELECT $1, $2, $3, 'PENDING', $4, $5
          WHERE EXISTS (
            SELECT 1 FROM reminder_cycles
             WHERE id = $2 AND status <> 'CANCELLED'
          )
         ON CONFLICT (reminder_cycle_id, attempt_no) DO NOTHING`,
        [crypto.randomUUID(), attempt.reminder_cycle_id, nextAttemptNo, now, scheduledFor],
      );
      await client.query(
        `UPDATE reminder_cycles
            SET status = 'PUSH_ATTEMPTING'
          WHERE id = $1 AND status <> 'CANCELLED'`,
        [attempt.reminder_cycle_id],
      );
      await client.query("COMMIT");
      return {
        retryScheduled: (inserted.rowCount ?? 0) > 0,
        terminal: false,
        fallbackCreated: false,
      };
    }

    if (delivery.invalidateDevice && attempt.device_id !== null) {
      await client.query(
        `UPDATE devices SET status = 'INVALID', updated_at = $2
          WHERE id = $1 AND status = 'ACTIVE'`,
        [attempt.device_id, now],
      );
    }
    const fallback = await client.query(
      `INSERT INTO wa_fallback_actions (
         id, reminder_cycle_id, mother_id, template_version_id, status
       )
       SELECT $1,
              cycle.id,
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
         FROM reminder_cycles cycle
        WHERE cycle.id = $2 AND cycle.status <> 'CANCELLED'
       ON CONFLICT (reminder_cycle_id) DO NOTHING`,
      [crypto.randomUUID(), attempt.reminder_cycle_id, attempt.mother_id, attempt.health_center_id],
    );
    await client.query(
      `UPDATE reminder_cycles
          SET status = 'WA_ACTION_REQUIRED'
        WHERE id = $1 AND status <> 'CANCELLED'`,
      [attempt.reminder_cycle_id],
    );
    await client.query("COMMIT");
    return {
      retryScheduled: false,
      terminal: true,
      fallbackCreated: (fallback.rowCount ?? 0) > 0,
    };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

function retryDelaySeconds(schedule: readonly number[], failedAttemptNo: number): number {
  return schedule[Math.min(failedAttemptNo - 1, schedule.length - 1)] ?? 60;
}

function renderApprovedTemplate(
  template: string,
  values: Pick<ClaimedPushAttempt, "milestone_code" | "facility_name">,
): string {
  return template.replace(
    /\{\{\s*(milestone_code|facility_name)\s*\}\}/gu,
    (_match, key: "milestone_code" | "facility_name") => values[key],
  );
}

function terminal(errorCode: string, invalidateDevice: boolean): PushDeliveryResult {
  return { status: "TERMINAL_FAILURE", errorCode, invalidateDevice };
}
