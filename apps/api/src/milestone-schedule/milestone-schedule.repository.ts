import type {
  MilestoneCode,
  MilestoneDueDateMutationResponse,
  MilestoneScheduleAction,
  VisitStatus,
} from "@anc/contracts";
import type { TransactionClient } from "@anc/database";
import type { QueryResultRow } from "pg";

import { dateOnlyInTimezone } from "../registry/registry-validation.js";

export interface ScheduleMilestoneDueDateInput {
  readonly eventId: string;
  readonly pregnancyId: string;
  readonly code: MilestoneCode;
  readonly healthCenterId: string;
  readonly actorStaffId: string;
  readonly dueDate: string;
  readonly expectedDueDate: string | null;
  readonly dueAt: Date;
  readonly timezone: string;
  readonly reason: string | null;
  readonly occurredAt: Date;
}

export interface MilestoneScheduleRepository {
  scheduleDueDate(
    client: TransactionClient,
    input: ScheduleMilestoneDueDateInput,
  ): Promise<MilestoneDueDateMutationResponse>;
  findScheduleMutation(
    client: TransactionClient,
    eventId: string,
    healthCenterId: string,
  ): Promise<MilestoneDueDateMutationResponse | null>;
}

export class MilestoneScheduleTargetUnavailableError extends Error {
  public constructor() {
    super("Milestone schedule target is outside the actor scope");
    this.name = "MilestoneScheduleTargetUnavailableError";
  }
}

export class MilestonePregnancyNotActiveError extends Error {
  public constructor() {
    super("Pregnancy is not active");
    this.name = "MilestonePregnancyNotActiveError";
  }
}

export class MilestoneNotSchedulableError extends Error {
  public constructor() {
    super("Milestone is in a terminal state");
    this.name = "MilestoneNotSchedulableError";
  }
}

export class MilestoneScheduleChangedError extends Error {
  public constructor() {
    super("Milestone due date changed after the client read it");
    this.name = "MilestoneScheduleChangedError";
  }
}

export class MilestoneDueDateUnchangedError extends Error {
  public constructor() {
    super("Milestone due date is unchanged");
    this.name = "MilestoneDueDateUnchangedError";
  }
}

export class MilestoneDueDateBeforePregnancyError extends Error {
  public constructor() {
    super("Milestone due date predates the pregnancy dating date");
    this.name = "MilestoneDueDateBeforePregnancyError";
  }
}

export class MilestoneRescheduleReasonRequiredError extends Error {
  public constructor() {
    super("A reason is required when rescheduling a milestone");
    this.name = "MilestoneRescheduleReasonRequiredError";
  }
}

interface MilestoneTargetRow extends QueryResultRow {
  readonly id: string;
  readonly pregnancy_status: "ACTIVE" | "CLOSED";
  readonly dating_date: string;
  readonly due_at: Date | null;
  readonly visit_status: VisitStatus;
}

interface ScheduleEventRow extends QueryResultRow {
  readonly event_id: string;
  readonly pregnancy_id: string;
  readonly milestone_id: string;
  readonly code: MilestoneCode;
  readonly action: MilestoneScheduleAction;
  readonly previous_due_date: string | null;
  readonly due_date: string;
  readonly due_at: Date;
  readonly timezone: string;
  readonly reason: string | null;
  readonly occurred_at: Date;
}

const terminalVisitStatuses = new Set<VisitStatus>(["CONFIRMED", "CANCELLED", "NOT_APPLICABLE"]);

export class PostgresMilestoneScheduleRepository implements MilestoneScheduleRepository {
  public async scheduleDueDate(
    client: TransactionClient,
    input: ScheduleMilestoneDueDateInput,
  ): Promise<MilestoneDueDateMutationResponse> {
    const targetResult = await client.query<MilestoneTargetRow>(
      `SELECT
         milestone.id,
         pregnancy.status AS pregnancy_status,
         pregnancy.dating_date::text AS dating_date,
         milestone.due_at,
         milestone.visit_status
       FROM pregnancy_milestones AS milestone
       JOIN pregnancies AS pregnancy ON pregnancy.id = milestone.pregnancy_id
      WHERE pregnancy.id = $1
        AND milestone.code = $2
        AND pregnancy.health_center_id = $3
      FOR UPDATE OF pregnancy, milestone`,
      [input.pregnancyId, input.code, input.healthCenterId],
    );
    const target = targetResult.rows[0];
    if (target === undefined) throw new MilestoneScheduleTargetUnavailableError();
    if (target.pregnancy_status !== "ACTIVE") throw new MilestonePregnancyNotActiveError();
    if (terminalVisitStatuses.has(target.visit_status)) throw new MilestoneNotSchedulableError();
    if (input.dueDate < target.dating_date) throw new MilestoneDueDateBeforePregnancyError();

    const currentDueDate =
      target.due_at === null ? null : dateOnlyInTimezone(target.due_at, input.timezone);
    if (currentDueDate !== input.expectedDueDate) throw new MilestoneScheduleChangedError();
    if (currentDueDate === input.dueDate) throw new MilestoneDueDateUnchangedError();

    const action: MilestoneScheduleAction = currentDueDate === null ? "SCHEDULED" : "RESCHEDULED";
    if (action === "RESCHEDULED" && input.reason === null) {
      throw new MilestoneRescheduleReasonRequiredError();
    }

    await client.query(
      `UPDATE pregnancy_milestones
          SET due_at = $2
        WHERE id = $1`,
      [target.id, input.dueAt],
    );
    await client.query(
      `INSERT INTO milestone_schedule_events (
         id, milestone_id, pregnancy_id, actor_staff_id, action,
         previous_due_at, previous_due_date,
         scheduled_due_at, scheduled_due_date, timezone, reason, occurred_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [
        input.eventId,
        target.id,
        input.pregnancyId,
        input.actorStaffId,
        action,
        target.due_at,
        currentDueDate,
        input.dueAt,
        input.dueDate,
        input.timezone,
        input.reason,
        input.occurredAt,
      ],
    );

    return {
      event_id: input.eventId,
      pregnancy_id: input.pregnancyId,
      milestone_id: target.id,
      code: input.code,
      action,
      previous_due_date: currentDueDate,
      due_date: input.dueDate,
      due_at: input.dueAt.toISOString(),
      timezone: input.timezone,
      reason: input.reason,
      occurred_at: input.occurredAt.toISOString(),
    };
  }

  public async findScheduleMutation(
    client: TransactionClient,
    eventId: string,
    healthCenterId: string,
  ): Promise<MilestoneDueDateMutationResponse | null> {
    const result = await client.query<ScheduleEventRow>(
      `SELECT
         event.id AS event_id,
         event.pregnancy_id,
         event.milestone_id,
         milestone.code,
         event.action,
         event.previous_due_date::text AS previous_due_date,
         event.scheduled_due_date::text AS due_date,
         event.scheduled_due_at AS due_at,
         event.timezone,
         event.reason,
         event.occurred_at
       FROM milestone_schedule_events AS event
       JOIN pregnancy_milestones AS milestone ON milestone.id = event.milestone_id
       JOIN pregnancies AS pregnancy ON pregnancy.id = event.pregnancy_id
      WHERE event.id = $1
        AND pregnancy.health_center_id = $2
      LIMIT 1`,
      [eventId, healthCenterId],
    );
    const row = result.rows[0];
    return row === undefined ? null : toScheduleResponse(row);
  }
}

function toScheduleResponse(row: ScheduleEventRow): MilestoneDueDateMutationResponse {
  return {
    event_id: row.event_id,
    pregnancy_id: row.pregnancy_id,
    milestone_id: row.milestone_id,
    code: row.code,
    action: row.action,
    previous_due_date: row.previous_due_date,
    due_date: row.due_date,
    due_at: row.due_at.toISOString(),
    timezone: row.timezone,
    reason: row.reason,
    occurred_at: row.occurred_at.toISOString(),
  };
}
