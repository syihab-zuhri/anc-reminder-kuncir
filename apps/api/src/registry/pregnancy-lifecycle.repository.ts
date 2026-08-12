import type { PregnancyLifecycleResponse } from "@anc/contracts";
import type { TransactionClient } from "@anc/database";
import type { QueryResultRow } from "pg";

import {
  initializePregnancyMilestones,
  resolveAssignableAncPlan,
} from "../anc-plan/anc-milestone-engine.js";

export type PregnancyLifecycleAction = "CREATED" | "CLOSED";

export interface PregnancyMutationResult {
  readonly mutationId: string;
  readonly pregnancy: PregnancyLifecycleResponse;
}

export interface PregnancyCloseCancellationSummary {
  readonly milestonesCancelled: number;
  readonly reminderCyclesCancelled: number;
  readonly waActionsExpired: number;
}

export interface PregnancyCloseMutationResult extends PregnancyMutationResult {
  readonly cancellation: PregnancyCloseCancellationSummary;
}

export interface CreatePregnancyInput {
  readonly pregnancyId: string;
  readonly lifecycleEventId: string;
  readonly motherId: string;
  readonly healthCenterId: string;
  readonly actorStaffId: string;
  readonly pregnancyStartDate: string;
  readonly occurredAt: Date;
}

export interface RevisePregnancyDatingInput {
  readonly revisionId: string;
  readonly pregnancyId: string;
  readonly healthCenterId: string;
  readonly actorStaffId: string;
  readonly pregnancyStartDate: string;
  readonly reason: string;
  readonly revisedAt: Date;
}

export interface ClosePregnancyInput {
  readonly lifecycleEventId: string;
  readonly pregnancyId: string;
  readonly healthCenterId: string;
  readonly actorStaffId: string;
  readonly reason: string;
  readonly closedAt: Date;
}

export interface PregnancyLifecycleRepository {
  create(client: TransactionClient, input: CreatePregnancyInput): Promise<PregnancyMutationResult>;
  reviseDating(
    client: TransactionClient,
    input: RevisePregnancyDatingInput,
  ): Promise<PregnancyMutationResult>;
  close(
    client: TransactionClient,
    input: ClosePregnancyInput,
  ): Promise<PregnancyCloseMutationResult>;
  findLifecycleMutation(
    client: TransactionClient,
    lifecycleEventId: string,
    healthCenterId: string,
    action: PregnancyLifecycleAction,
  ): Promise<PregnancyLifecycleResponse | null>;
  findDatingRevisionMutation(
    client: TransactionClient,
    revisionId: string,
    healthCenterId: string,
  ): Promise<PregnancyLifecycleResponse | null>;
}

export class PregnancyTargetUnavailableError extends Error {
  public constructor() {
    super("Pregnancy lifecycle target is outside the actor scope");
    this.name = "PregnancyTargetUnavailableError";
  }
}

export class ActivePregnancyExistsError extends Error {
  public constructor() {
    super("Mother already has an active pregnancy");
    this.name = "ActivePregnancyExistsError";
  }
}

export class PregnancyNotActiveError extends Error {
  public constructor() {
    super("Pregnancy is not active");
    this.name = "PregnancyNotActiveError";
  }
}

export class PregnancyDatingUnchangedError extends Error {
  public constructor() {
    super("Pregnancy dating input is unchanged");
    this.name = "PregnancyDatingUnchangedError";
  }
}

interface IdRow extends QueryResultRow {
  readonly id: string;
}

interface PregnancyRow extends QueryResultRow {
  readonly id: string;
  readonly mother_id: string;
  readonly health_center_id: string;
  readonly dating_basis: "PREGNANCY_START_DATE";
  readonly dating_date: string;
  readonly status: "ACTIVE" | "CLOSED";
  readonly closed_at: Date | null;
}

export class PostgresPregnancyLifecycleRepository implements PregnancyLifecycleRepository {
  public constructor(private readonly allowSyntheticPlan = false) {}

  public async create(
    client: TransactionClient,
    input: CreatePregnancyInput,
  ): Promise<PregnancyMutationResult> {
    const mother = await client.query<IdRow>(
      `SELECT id
         FROM mothers
        WHERE id = $1 AND health_center_id = $2
        FOR KEY SHARE`,
      [input.motherId, input.healthCenterId],
    );
    if (mother.rows[0] === undefined) throw new PregnancyTargetUnavailableError();

    const activePregnancy = await client.query<IdRow>(
      `SELECT id
         FROM pregnancies
        WHERE mother_id = $1 AND status = 'ACTIVE'
        LIMIT 1
        FOR UPDATE`,
      [input.motherId],
    );
    if (activePregnancy.rows[0] !== undefined) throw new ActivePregnancyExistsError();

    const plan = await resolveAssignableAncPlan(client, this.allowSyntheticPlan);

    await client.query(
      `INSERT INTO pregnancies (
         id, mother_id, health_center_id, dating_basis, dating_date, status, care_plan_version_id
       ) VALUES ($1, $2, $3, 'PREGNANCY_START_DATE', $4, 'ACTIVE', $5)`,
      [input.pregnancyId, input.motherId, input.healthCenterId, input.pregnancyStartDate, plan.id],
    );
    await initializePregnancyMilestones(client, input.pregnancyId, plan);
    await client.query(
      `INSERT INTO pregnancy_lifecycle_events (
         id, pregnancy_id, actor_staff_id, action, dating_basis, dating_date,
         status, reason, occurred_at
       ) VALUES ($1, $2, $3, 'CREATED', 'PREGNANCY_START_DATE', $4, 'ACTIVE', NULL, $5)`,
      [
        input.lifecycleEventId,
        input.pregnancyId,
        input.actorStaffId,
        input.pregnancyStartDate,
        input.occurredAt,
      ],
    );
    return {
      mutationId: input.lifecycleEventId,
      pregnancy: activePregnancyResponse(input),
    };
  }

  public async reviseDating(
    client: TransactionClient,
    input: RevisePregnancyDatingInput,
  ): Promise<PregnancyMutationResult> {
    const pregnancy = await lockPregnancy(client, input.pregnancyId, input.healthCenterId);
    if (pregnancy.status !== "ACTIVE") throw new PregnancyNotActiveError();
    if (pregnancy.dating_date === input.pregnancyStartDate) {
      throw new PregnancyDatingUnchangedError();
    }

    await client.query(
      `UPDATE pregnancies
          SET dating_basis = 'PREGNANCY_START_DATE', dating_date = $2
        WHERE id = $1`,
      [input.pregnancyId, input.pregnancyStartDate],
    );
    await client.query(
      `INSERT INTO pregnancy_dating_revisions (
         id, pregnancy_id, actor_staff_id,
         previous_dating_basis, previous_dating_date,
         revised_dating_basis, revised_dating_date,
         reason, revised_at
       ) VALUES ($1, $2, $3, $4, $5, 'PREGNANCY_START_DATE', $6, $7, $8)`,
      [
        input.revisionId,
        input.pregnancyId,
        input.actorStaffId,
        pregnancy.dating_basis,
        pregnancy.dating_date,
        input.pregnancyStartDate,
        input.reason,
        input.revisedAt,
      ],
    );
    return {
      mutationId: input.revisionId,
      pregnancy: {
        ...toPregnancyResponse(pregnancy),
        dating_basis: "PREGNANCY_START_DATE",
        dating_date: input.pregnancyStartDate,
      },
    };
  }

  public async close(
    client: TransactionClient,
    input: ClosePregnancyInput,
  ): Promise<PregnancyCloseMutationResult> {
    const pregnancy = await lockPregnancy(client, input.pregnancyId, input.healthCenterId);
    if (pregnancy.status !== "ACTIVE") throw new PregnancyNotActiveError();

    await client.query(
      `INSERT INTO pregnancy_lifecycle_events (
         id, pregnancy_id, actor_staff_id, action, dating_basis, dating_date,
         status, reason, occurred_at
       ) VALUES ($1, $2, $3, 'CLOSED', $4, $5, 'CLOSED', $6, $7)`,
      [
        input.lifecycleEventId,
        input.pregnancyId,
        input.actorStaffId,
        pregnancy.dating_basis,
        pregnancy.dating_date,
        input.reason,
        input.closedAt,
      ],
    );

    const cancelledReminderCycles = await client.query<IdRow>(
      `WITH candidates AS (
         SELECT cycle.id,
                cycle.milestone_id,
                cycle.status::text AS previous_status
           FROM reminder_cycles AS cycle
           JOIN pregnancy_milestones AS milestone ON milestone.id = cycle.milestone_id
          WHERE milestone.pregnancy_id = $1
            AND cycle.status IN (
              'PENDING',
              'PUSH_ATTEMPTING',
              'WA_ACTION_REQUIRED',
              'MANUAL_FOLLOWUP',
              'ESCALATED'
            )
          FOR UPDATE OF cycle
       ), cancelled AS (
         UPDATE reminder_cycles AS cycle
            SET status = 'CANCELLED', closed_at = $3
           FROM candidates AS candidate
          WHERE cycle.id = candidate.id
        RETURNING cycle.id, cycle.milestone_id, candidate.previous_status
       )
       INSERT INTO pregnancy_close_cancellation_events (
         lifecycle_event_id, pregnancy_id, milestone_id, reminder_cycle_id,
         target, previous_status, cancelled_at
       )
       SELECT $2, $1, milestone_id, id, 'REMINDER_CYCLE', previous_status, $3
         FROM cancelled
       RETURNING id`,
      [input.pregnancyId, input.lifecycleEventId, input.closedAt],
    );

    const expiredWaActions = await client.query<IdRow>(
      `UPDATE wa_fallback_actions AS action
          SET status = 'EXPIRED'
        WHERE action.reminder_cycle_id IN (
          SELECT cancellation.reminder_cycle_id
            FROM pregnancy_close_cancellation_events AS cancellation
           WHERE cancellation.lifecycle_event_id = $1
             AND cancellation.target = 'REMINDER_CYCLE'
        )
          AND action.status IN ('READY', 'LINK_GENERATED', 'LINK_OPENED')
      RETURNING action.id`,
      [input.lifecycleEventId],
    );

    const cancelledMilestones = await client.query<IdRow>(
      `WITH candidates AS (
         SELECT milestone.id,
                milestone.visit_status::text AS previous_status
           FROM pregnancy_milestones AS milestone
          WHERE milestone.pregnancy_id = $1
            AND milestone.visit_status IN ('UPCOMING', 'DUE', 'OVERDUE')
          FOR UPDATE
       ), cancelled AS (
         UPDATE pregnancy_milestones AS milestone
            SET visit_status = 'CANCELLED'
           FROM candidates AS candidate
          WHERE milestone.id = candidate.id
        RETURNING milestone.id, candidate.previous_status
       )
       INSERT INTO pregnancy_close_cancellation_events (
         lifecycle_event_id, pregnancy_id, milestone_id, reminder_cycle_id,
         target, previous_status, cancelled_at
       )
       SELECT $2, $1, id, NULL, 'MILESTONE', previous_status, $3
         FROM cancelled
       RETURNING id`,
      [input.pregnancyId, input.lifecycleEventId, input.closedAt],
    );

    await client.query(
      `UPDATE pregnancies
          SET status = 'CLOSED', closed_at = $2
        WHERE id = $1`,
      [input.pregnancyId, input.closedAt],
    );

    return {
      mutationId: input.lifecycleEventId,
      pregnancy: {
        ...toPregnancyResponse(pregnancy),
        status: "CLOSED",
        closed_at: input.closedAt.toISOString(),
      },
      cancellation: {
        milestonesCancelled: cancelledMilestones.rowCount ?? 0,
        reminderCyclesCancelled: cancelledReminderCycles.rowCount ?? 0,
        waActionsExpired: expiredWaActions.rowCount ?? 0,
      },
    };
  }

  public async findLifecycleMutation(
    client: TransactionClient,
    lifecycleEventId: string,
    healthCenterId: string,
    action: PregnancyLifecycleAction,
  ): Promise<PregnancyLifecycleResponse | null> {
    const result = await client.query<PregnancyRow>(
      `SELECT
         pregnancy.id,
         pregnancy.mother_id,
         pregnancy.health_center_id,
         event.dating_basis,
         event.dating_date::text AS dating_date,
         event.status,
         CASE WHEN event.action = 'CLOSED' THEN event.occurred_at ELSE NULL END AS closed_at
       FROM pregnancy_lifecycle_events AS event
       JOIN pregnancies AS pregnancy ON pregnancy.id = event.pregnancy_id
      WHERE event.id = $1
        AND pregnancy.health_center_id = $2
        AND event.action = $3
      LIMIT 1`,
      [lifecycleEventId, healthCenterId, action],
    );
    const row = result.rows[0];
    return row === undefined ? null : toPregnancyResponse(row);
  }

  public async findDatingRevisionMutation(
    client: TransactionClient,
    revisionId: string,
    healthCenterId: string,
  ): Promise<PregnancyLifecycleResponse | null> {
    const result = await client.query<PregnancyRow>(
      `SELECT
         pregnancy.id,
         pregnancy.mother_id,
         pregnancy.health_center_id,
         revision.revised_dating_basis AS dating_basis,
         revision.revised_dating_date::text AS dating_date,
         'ACTIVE'::pregnancy_status AS status,
         NULL::timestamptz AS closed_at
       FROM pregnancy_dating_revisions AS revision
       JOIN pregnancies AS pregnancy ON pregnancy.id = revision.pregnancy_id
      WHERE revision.id = $1
        AND pregnancy.health_center_id = $2
      LIMIT 1`,
      [revisionId, healthCenterId],
    );
    const row = result.rows[0];
    return row === undefined ? null : toPregnancyResponse(row);
  }
}

async function lockPregnancy(
  client: TransactionClient,
  pregnancyId: string,
  healthCenterId: string,
): Promise<PregnancyRow> {
  const result = await client.query<PregnancyRow>(
    `SELECT
       id, mother_id, health_center_id, dating_basis,
       dating_date::text AS dating_date, status, closed_at
     FROM pregnancies
    WHERE id = $1 AND health_center_id = $2
    FOR UPDATE`,
    [pregnancyId, healthCenterId],
  );
  const row = result.rows[0];
  if (row === undefined) throw new PregnancyTargetUnavailableError();
  return row;
}

function activePregnancyResponse(input: CreatePregnancyInput): PregnancyLifecycleResponse {
  return {
    id: input.pregnancyId,
    mother_id: input.motherId,
    health_center_id: input.healthCenterId,
    dating_basis: "PREGNANCY_START_DATE",
    dating_date: input.pregnancyStartDate,
    status: "ACTIVE",
    closed_at: null,
  };
}

function toPregnancyResponse(row: PregnancyRow): PregnancyLifecycleResponse {
  return {
    id: row.id,
    mother_id: row.mother_id,
    health_center_id: row.health_center_id,
    dating_basis: row.dating_basis,
    dating_date: row.dating_date,
    status: row.status,
    closed_at: row.closed_at?.toISOString() ?? null,
  };
}
