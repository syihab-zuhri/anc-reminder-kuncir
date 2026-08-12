import type {
  FacilityType,
  MilestoneCode,
  RecordValidationStatus,
  RequiredFacilityPolicy,
  StaffRole,
  VisitConfirmationResponse,
  VisitStatus,
} from "@anc/contracts";
import type { TransactionClient } from "@anc/database";
import type { QueryResultRow } from "pg";

import { isFacilityTypeAllowed } from "../anc-plan/facility-policy.js";

export interface ConfirmVisitInput {
  readonly confirmationId: string;
  readonly milestoneId: string;
  readonly actorStaffId: string;
  readonly actorRole: StaffRole;
  readonly healthCenterId: string;
  readonly occurredOn: string;
  readonly facilityId: string;
  readonly confirmedAt: Date;
}

export interface VisitConfirmationReplayScope {
  readonly actorStaffId: string;
  readonly actorRole: StaffRole;
  readonly healthCenterId: string;
}

export interface VisitConfirmationMutationResult {
  readonly created: boolean;
  readonly confirmation: VisitConfirmationResponse;
}

export interface VisitConfirmationRepository {
  confirm(
    client: TransactionClient,
    input: ConfirmVisitInput,
  ): Promise<VisitConfirmationMutationResult>;
  findConfirmationMutation(
    client: TransactionClient,
    confirmationId: string,
    scope: VisitConfirmationReplayScope,
  ): Promise<VisitConfirmationResponse | null>;
}

export class VisitConfirmationTargetUnavailableError extends Error {
  public constructor() {
    super("Visit confirmation target is outside the actor scope");
    this.name = "VisitConfirmationTargetUnavailableError";
  }
}

export class VisitConfirmationCodeForbiddenError extends Error {
  public constructor() {
    super("Actor role cannot confirm this milestone code");
    this.name = "VisitConfirmationCodeForbiddenError";
  }
}

export class VisitConfirmationPregnancyNotActiveError extends Error {
  public constructor() {
    super("Pregnancy is not active");
    this.name = "VisitConfirmationPregnancyNotActiveError";
  }
}

export class VisitConfirmationInvalidTransitionError extends Error {
  public constructor() {
    super("Milestone cannot transition to confirmed");
    this.name = "VisitConfirmationInvalidTransitionError";
  }
}

export class VisitConfirmationCorrectionRequiredError extends Error {
  public constructor() {
    super("Confirmed visit facts differ and require the correction workflow");
    this.name = "VisitConfirmationCorrectionRequiredError";
  }
}

export class VisitConfirmationHistoryMissingError extends Error {
  public constructor() {
    super("Confirmed milestone has no initial confirmation history");
    this.name = "VisitConfirmationHistoryMissingError";
  }
}

export class VisitConfirmationFacilityUnavailableError extends Error {
  public constructor() {
    super("Facility is unavailable in the pregnancy health-center scope");
    this.name = "VisitConfirmationFacilityUnavailableError";
  }
}

export class VisitConfirmationFacilityNotAllowedError extends Error {
  public constructor() {
    super("Facility type is not allowed by the milestone rule snapshot");
    this.name = "VisitConfirmationFacilityNotAllowedError";
  }
}

export class VisitConfirmationDateBeforePregnancyError extends Error {
  public constructor() {
    super("Visit occurrence date predates pregnancy dating");
    this.name = "VisitConfirmationDateBeforePregnancyError";
  }
}

interface ConfirmationTargetRow extends QueryResultRow {
  readonly milestone_id: string;
  readonly pregnancy_id: string;
  readonly code: MilestoneCode;
  readonly pregnancy_status: "ACTIVE" | "CLOSED";
  readonly dating_date: string;
  readonly visit_status: VisitStatus;
  readonly record_validation_status: RecordValidationStatus;
  readonly required_facility_policy: RequiredFacilityPolicy;
  readonly allowed_facility_types: FacilityType[];
}

interface FacilityRow extends QueryResultRow {
  readonly facility_type: FacilityType;
}

interface ConfirmationRow extends QueryResultRow {
  readonly id: string;
  readonly milestone_id: string;
  readonly pregnancy_id: string;
  readonly code: MilestoneCode;
  readonly record_validation_status: RecordValidationStatus;
  readonly occurred_on: string;
  readonly facility_id: string | null;
  readonly confirmation_source: "STAFF_WEB" | "LEGACY_UNKNOWN";
  readonly actor_staff_id: string;
  readonly created_at: Date;
}

export class PostgresVisitConfirmationRepository implements VisitConfirmationRepository {
  public async confirm(
    client: TransactionClient,
    input: ConfirmVisitInput,
  ): Promise<VisitConfirmationMutationResult> {
    const target = await lockConfirmationTarget(client, input);
    assertRoleMayConfirm(input.actorRole, target.code);
    if (target.pregnancy_status !== "ACTIVE") {
      throw new VisitConfirmationPregnancyNotActiveError();
    }
    if (target.visit_status === "CONFIRMED") {
      const existing = await findInitialConfirmation(client, target.milestone_id);
      if (existing === null) throw new VisitConfirmationHistoryMissingError();
      if (existing.occurred_on !== input.occurredOn || existing.facility_id !== input.facilityId) {
        throw new VisitConfirmationCorrectionRequiredError();
      }
      return { created: false, confirmation: toConfirmationResponse(existing) };
    }
    if (target.visit_status === "CANCELLED" || target.visit_status === "NOT_APPLICABLE") {
      throw new VisitConfirmationInvalidTransitionError();
    }
    if (input.occurredOn < target.dating_date) {
      throw new VisitConfirmationDateBeforePregnancyError();
    }

    const facility = await findFacility(client, input.facilityId, input.healthCenterId);
    if (facility === null) throw new VisitConfirmationFacilityUnavailableError();
    if (
      !isFacilityTypeAllowed(
        {
          required_facility_policy: target.required_facility_policy,
          allowed_facility_types: target.allowed_facility_types,
        },
        facility.facility_type,
      )
    ) {
      throw new VisitConfirmationFacilityNotAllowedError();
    }

    await client.query(
      `UPDATE pregnancy_milestones
          SET visit_status = 'CONFIRMED', confirmed_at = $2, confirmed_by = $3
        WHERE id = $1`,
      [target.milestone_id, input.confirmedAt, input.actorStaffId],
    );
    await client.query(
      `INSERT INTO visit_confirmations (
         id, milestone_id, actor_staff_id, action, facility_id,
         occurred_on, reason, confirmation_source, created_at
       ) VALUES ($1, $2, $3, 'CONFIRM', $4, $5, NULL, 'STAFF_WEB', $6)`,
      [
        input.confirmationId,
        target.milestone_id,
        input.actorStaffId,
        input.facilityId,
        input.occurredOn,
        input.confirmedAt,
      ],
    );

    // TASK-P4-014: Suppress active reminder cycles atomically upon confirmation
    await client.query(
      `UPDATE reminder_cycles
          SET status = 'CANCELLED', closed_at = CURRENT_TIMESTAMP
        WHERE milestone_id = $1 AND status IN ('PENDING', 'PUSH_ATTEMPTING', 'WA_ACTION_REQUIRED', 'MANUAL_FOLLOWUP', 'ESCALATED')`,
      [target.milestone_id],
    );

    return {
      created: true,
      confirmation: {
        id: input.confirmationId,
        milestone_id: target.milestone_id,
        pregnancy_id: target.pregnancy_id,
        code: target.code,
        visit_status: "CONFIRMED",
        record_validation_status: target.record_validation_status,
        occurred_on: input.occurredOn,
        facility_id: input.facilityId,
        confirmation_source: "STAFF_WEB",
        confirmed_by_staff_id: input.actorStaffId,
        confirmed_at: input.confirmedAt.toISOString(),
      },
    };
  }

  public async findConfirmationMutation(
    client: TransactionClient,
    confirmationId: string,
    scope: VisitConfirmationReplayScope,
  ): Promise<VisitConfirmationResponse | null> {
    const result = await client.query<ConfirmationRow>(
      `${confirmationSelect()}
       WHERE confirmation.id = $1
         AND pregnancy.health_center_id = $2
         AND ${roleScopeSql("$3", "$4")}
         AND ${roleCodeSql("$3")}
       LIMIT 1`,
      [confirmationId, scope.healthCenterId, scope.actorRole, scope.actorStaffId],
    );
    const row = result.rows[0];
    return row === undefined ? null : toConfirmationResponse(row);
  }
}

async function lockConfirmationTarget(
  client: TransactionClient,
  input: ConfirmVisitInput,
): Promise<ConfirmationTargetRow> {
  const result = await client.query<ConfirmationTargetRow>(
    `SELECT
       milestone.id AS milestone_id,
       milestone.pregnancy_id,
       milestone.code,
       pregnancy.status AS pregnancy_status,
       pregnancy.dating_date::text AS dating_date,
       milestone.visit_status,
       milestone.record_validation_status,
       rule.required_facility_policy,
       rule.allowed_facility_types
     FROM pregnancy_milestones AS milestone
     JOIN pregnancies AS pregnancy ON pregnancy.id = milestone.pregnancy_id
     JOIN mothers AS mother ON mother.id = pregnancy.mother_id
     JOIN anc_milestone_rules AS rule
       ON rule.id = milestone.rule_id
      AND rule.plan_version_id = milestone.plan_version_id
      AND rule.code = milestone.code
    WHERE milestone.id = $1
      AND pregnancy.health_center_id = $2
      AND ${roleScopeSql("$3", "$4")}
    FOR UPDATE OF pregnancy, milestone`,
    [input.milestoneId, input.healthCenterId, input.actorRole, input.actorStaffId],
  );
  const row = result.rows[0];
  if (row === undefined) throw new VisitConfirmationTargetUnavailableError();
  return row;
}

async function findFacility(
  client: TransactionClient,
  facilityId: string,
  healthCenterId: string,
): Promise<FacilityRow | null> {
  const result = await client.query<FacilityRow>(
    `SELECT facility_type
       FROM facilities
      WHERE id = $1
        AND health_center_id = $2
        AND status = 'ACTIVE'
      FOR KEY SHARE`,
    [facilityId, healthCenterId],
  );
  return result.rows[0] ?? null;
}

async function findInitialConfirmation(
  client: TransactionClient,
  milestoneId: string,
): Promise<ConfirmationRow | null> {
  const result = await client.query<ConfirmationRow>(
    `${confirmationSelect()}
     WHERE confirmation.milestone_id = $1
       AND confirmation.action = 'CONFIRM'
     LIMIT 1`,
    [milestoneId],
  );
  return result.rows[0] ?? null;
}

function confirmationSelect(): string {
  return `SELECT
     confirmation.id,
     confirmation.milestone_id,
     milestone.pregnancy_id,
     milestone.code,
     milestone.record_validation_status,
     confirmation.occurred_on::text AS occurred_on,
     confirmation.facility_id,
     confirmation.confirmation_source,
     confirmation.actor_staff_id,
     confirmation.created_at
   FROM visit_confirmations AS confirmation
   JOIN pregnancy_milestones AS milestone ON milestone.id = confirmation.milestone_id
   JOIN pregnancies AS pregnancy ON pregnancy.id = milestone.pregnancy_id
   JOIN mothers AS mother ON mother.id = pregnancy.mother_id`;
}

function roleScopeSql(roleParameter: string, staffIdParameter: string): string {
  return `(
    ${roleParameter}::staff_role = 'PUSKESMAS'
    OR (
      ${roleParameter}::staff_role = 'BIDAN'
      AND EXISTS (
        SELECT 1
          FROM staff_assignments AS assignment
         WHERE assignment.staff_user_id = ${staffIdParameter}
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
    )
  )`;
}

function roleCodeSql(roleParameter: string): string {
  return `(
    ${roleParameter}::staff_role = 'PUSKESMAS'
    OR (
      ${roleParameter}::staff_role = 'BIDAN'
      AND milestone.code IN ('K2', 'K3', 'K6', 'K7')
    )
  )`;
}

function assertRoleMayConfirm(role: StaffRole, code: MilestoneCode): void {
  if (role === "PUSKESMAS") return;
  if (role === "BIDAN" && ["K2", "K3", "K6", "K7"].includes(code)) return;
  throw new VisitConfirmationCodeForbiddenError();
}

function toConfirmationResponse(row: ConfirmationRow): VisitConfirmationResponse {
  if (row.confirmation_source !== "STAFF_WEB" || row.facility_id === null) {
    throw new VisitConfirmationHistoryMissingError();
  }
  return {
    id: row.id,
    milestone_id: row.milestone_id,
    pregnancy_id: row.pregnancy_id,
    code: row.code,
    visit_status: "CONFIRMED",
    record_validation_status: row.record_validation_status,
    occurred_on: row.occurred_on,
    facility_id: row.facility_id,
    confirmation_source: row.confirmation_source,
    confirmed_by_staff_id: row.actor_staff_id,
    confirmed_at: row.created_at.toISOString(),
  };
}
