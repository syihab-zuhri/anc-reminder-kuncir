import type { ClinicalRecordResponse, K1K6MilestoneCode, VisitStatus } from "@anc/contracts";
import type { DatabasePool, TransactionClient } from "@anc/database";
import type { QueryResultRow } from "pg";

export interface SaveClinicalRecordInput {
  readonly recordId: string;
  readonly revisionId: string;
  readonly milestoneId: string;
  readonly healthCenterId: string;
  readonly actorStaffId: string;
  readonly expectedRevisionId: string | null;
  readonly schemaVersion: string;
  readonly recordPayload: ClinicalRecordResponse["record_payload"];
  readonly occurredAt: Date;
}

export interface ChangeClinicalRecordValidationInput {
  readonly eventId: string;
  readonly milestoneId: string;
  readonly healthCenterId: string;
  readonly actorStaffId: string;
  readonly expectedRevisionId: string;
  readonly occurredAt: Date;
  readonly reason: string | null;
}

export interface ClinicalRecordMutationResult {
  readonly created: boolean;
  readonly mutationId: string;
  readonly record: ClinicalRecordResponse;
}

export interface ClinicalRecordRepository {
  findCurrentRecord(
    milestoneId: string,
    healthCenterId: string,
  ): Promise<ClinicalRecordResponse | null>;
  save(
    client: TransactionClient,
    input: SaveClinicalRecordInput,
  ): Promise<ClinicalRecordMutationResult>;
  findSaveMutation(
    client: TransactionClient,
    revisionId: string,
    healthCenterId: string,
  ): Promise<ClinicalRecordResponse | null>;
  validate(
    client: TransactionClient,
    input: ChangeClinicalRecordValidationInput,
  ): Promise<ClinicalRecordMutationResult>;
  reopen(
    client: TransactionClient,
    input: ChangeClinicalRecordValidationInput,
  ): Promise<ClinicalRecordMutationResult>;
  findValidationMutation(
    client: TransactionClient,
    eventId: string,
    healthCenterId: string,
  ): Promise<ClinicalRecordResponse | null>;
}

export class ClinicalRecordTargetUnavailableError extends Error {
  public constructor() {
    super("Clinical record target is outside the Puskesmas scope or K1-K6 boundary");
    this.name = "ClinicalRecordTargetUnavailableError";
  }
}

export class ClinicalRecordNotFoundError extends Error {
  public constructor() {
    super("Clinical record does not exist");
    this.name = "ClinicalRecordNotFoundError";
  }
}

export class ClinicalRecordPregnancyNotActiveError extends Error {
  public constructor() {
    super("Pregnancy is not active");
    this.name = "ClinicalRecordPregnancyNotActiveError";
  }
}

export class ClinicalRecordMilestoneTerminalError extends Error {
  public constructor() {
    super("Milestone cannot accept clinical record mutations");
    this.name = "ClinicalRecordMilestoneTerminalError";
  }
}

export class ClinicalRecordRevisionChangedError extends Error {
  public constructor() {
    super("Clinical record revision changed after the client read it");
    this.name = "ClinicalRecordRevisionChangedError";
  }
}

export class ClinicalRecordReopenRequiredError extends Error {
  public constructor() {
    super("Validated clinical record must be reopened before editing");
    this.name = "ClinicalRecordReopenRequiredError";
  }
}

export class ClinicalRecordVisitNotConfirmedError extends Error {
  public constructor() {
    super("Visit must be confirmed before final record validation");
    this.name = "ClinicalRecordVisitNotConfirmedError";
  }
}

export class ClinicalRecordAlreadyIncompleteError extends Error {
  public constructor() {
    super("Clinical record is already incomplete");
    this.name = "ClinicalRecordAlreadyIncompleteError";
  }
}

export class ClinicalRecordHistoryMissingError extends Error {
  public constructor() {
    super("Clinical record immutable history is missing or inconsistent");
    this.name = "ClinicalRecordHistoryMissingError";
  }
}

interface ClinicalRecordTargetRow extends QueryResultRow {
  readonly milestone_id: string;
  readonly pregnancy_id: string;
  readonly code: K1K6MilestoneCode;
  readonly pregnancy_status: "ACTIVE" | "CLOSED";
  readonly visit_status: VisitStatus;
  readonly milestone_validation_status: "INCOMPLETE" | "VALIDATED";
}

interface CurrentClinicalRecordRow extends QueryResultRow {
  readonly record_id: string;
  readonly milestone_id: string;
  readonly pregnancy_id: string;
  readonly code: K1K6MilestoneCode;
  readonly schema_version: string;
  readonly record_payload: ClinicalRecordResponse["record_payload"];
  readonly record_status: "INCOMPLETE" | "VALIDATED";
  readonly validated_at: Date | null;
  readonly validated_by: string | null;
  readonly revision_id: string | null;
  readonly revision_no: number | null;
}

interface ReadClinicalRecordRow extends QueryResultRow {
  readonly milestone_id: string;
  readonly pregnancy_id: string;
  readonly code: K1K6MilestoneCode;
  readonly milestone_validation_status: "INCOMPLETE" | "VALIDATED";
  readonly record_id: string | null;
  readonly schema_version: string | null;
  readonly record_payload: ClinicalRecordResponse["record_payload"] | null;
  readonly record_status: "INCOMPLETE" | "VALIDATED" | null;
  readonly validated_at: Date | null;
  readonly validated_by: string | null;
  readonly revision_id: string | null;
  readonly revision_no: number | null;
}

interface RevisionMutationRow extends QueryResultRow {
  readonly record_id: string;
  readonly milestone_id: string;
  readonly pregnancy_id: string;
  readonly code: K1K6MilestoneCode;
  readonly revision_id: string;
  readonly revision_no: number;
  readonly schema_version: string;
  readonly record_payload: ClinicalRecordResponse["record_payload"];
}

interface ValidationEventRow extends RevisionMutationRow {
  readonly event_id: string;
  readonly action: "VALIDATE" | "REOPEN" | "CORRECT";
  readonly reason: string | null;
  readonly resulting_status: "INCOMPLETE" | "VALIDATED" | null;
  readonly validated_at_snapshot: Date | null;
  readonly validated_by_snapshot: string | null;
}

export class PostgresClinicalRecordRepository implements ClinicalRecordRepository {
  public constructor(private readonly pool: DatabasePool) {}

  public async findCurrentRecord(
    milestoneId: string,
    healthCenterId: string,
  ): Promise<ClinicalRecordResponse | null> {
    const result = await this.pool.query<ReadClinicalRecordRow>(
      `${readRecordSelect()}
       WHERE milestone.id = $1
         AND pregnancy.health_center_id = $2
         AND milestone.code IN ('K1', 'K2', 'K3', 'K4', 'K5', 'K6')
       LIMIT 1`,
      [milestoneId, healthCenterId],
    );
    const row = result.rows[0];
    if (row === undefined) throw new ClinicalRecordTargetUnavailableError();
    if (row.record_id === null) return null;
    return currentReadRowToResponse(row);
  }

  public async save(
    client: TransactionClient,
    input: SaveClinicalRecordInput,
  ): Promise<ClinicalRecordMutationResult> {
    const target = await lockTarget(client, input.milestoneId, input.healthCenterId);
    assertMutableTarget(target);
    const current = await lockCurrentRecord(client, target);

    let recordId: string;
    let revisionNo: number;
    if (current === null) {
      if (input.expectedRevisionId !== null) throw new ClinicalRecordRevisionChangedError();
      recordId = input.recordId;
      revisionNo = 1;
      await client.query(
        `INSERT INTO k1_k6_records (
           id, milestone_id, milestone_code, record_payload, schema_version,
           status, validated_at, validated_by, created_at, updated_at
         ) VALUES ($1, $2, $3, $4, $5, 'INCOMPLETE', NULL, NULL, $6, $6)`,
        [
          recordId,
          target.milestone_id,
          target.code,
          input.recordPayload,
          input.schemaVersion,
          input.occurredAt,
        ],
      );
    } else {
      assertCurrentRecordConsistent(current, target);
      if (current.revision_id !== input.expectedRevisionId) {
        throw new ClinicalRecordRevisionChangedError();
      }
      if (current.record_status === "VALIDATED") throw new ClinicalRecordReopenRequiredError();
      recordId = current.record_id;
      revisionNo = requireRevisionNumber(current) + 1;
      await client.query(
        `UPDATE k1_k6_records
            SET record_payload = $2,
                schema_version = $3,
                status = 'INCOMPLETE',
                validated_at = NULL,
                validated_by = NULL
          WHERE id = $1`,
        [recordId, input.recordPayload, input.schemaVersion],
      );
    }

    await client.query(
      `INSERT INTO k1_k6_record_revisions (
         id, record_id, milestone_id, revision_no, actor_staff_id,
         schema_version, record_payload, occurred_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        input.revisionId,
        recordId,
        target.milestone_id,
        revisionNo,
        input.actorStaffId,
        input.schemaVersion,
        input.recordPayload,
        input.occurredAt,
      ],
    );
    await client.query(
      `UPDATE pregnancy_milestones
          SET record_validation_status = 'INCOMPLETE'
        WHERE id = $1`,
      [target.milestone_id],
    );

    return {
      created: true,
      mutationId: input.revisionId,
      record: toResponse({
        record_id: recordId,
        milestone_id: target.milestone_id,
        pregnancy_id: target.pregnancy_id,
        code: target.code,
        revision_id: input.revisionId,
        revision_no: revisionNo,
        schema_version: input.schemaVersion,
        record_payload: input.recordPayload,
        record_validation_status: "INCOMPLETE",
        validated_at: null,
        validated_by_staff_id: null,
      }),
    };
  }

  public async findSaveMutation(
    client: TransactionClient,
    revisionId: string,
    healthCenterId: string,
  ): Promise<ClinicalRecordResponse | null> {
    const result = await client.query<RevisionMutationRow>(
      `${revisionMutationSelect()}
       WHERE revision.id = $1
         AND pregnancy.health_center_id = $2
       LIMIT 1`,
      [revisionId, healthCenterId],
    );
    const row = result.rows[0];
    return row === undefined ? null : revisionRowToResponse(row, "INCOMPLETE", null, null);
  }

  public async validate(
    client: TransactionClient,
    input: ChangeClinicalRecordValidationInput,
  ): Promise<ClinicalRecordMutationResult> {
    const target = await lockTarget(client, input.milestoneId, input.healthCenterId);
    assertMutableTarget(target);
    if (target.visit_status !== "CONFIRMED") throw new ClinicalRecordVisitNotConfirmedError();
    const current = await requireCurrentRecord(client, target, input.expectedRevisionId);

    if (current.record_status === "VALIDATED") {
      const duplicate = await findLatestValidationEvent(client, current.record_id, "VALIDATE");
      if (duplicate === null || duplicate.revision_id !== input.expectedRevisionId) {
        throw new ClinicalRecordHistoryMissingError();
      }
      return {
        created: false,
        mutationId: duplicate.event_id,
        record: validationEventToResponse(duplicate),
      };
    }

    await client.query(
      `UPDATE k1_k6_records
          SET status = 'VALIDATED', validated_at = $2, validated_by = $3
        WHERE id = $1`,
      [current.record_id, input.occurredAt, input.actorStaffId],
    );
    await client.query(
      `UPDATE pregnancy_milestones
          SET record_validation_status = 'VALIDATED'
        WHERE id = $1`,
      [target.milestone_id],
    );
    await insertValidationEvent(client, {
      ...input,
      recordId: current.record_id,
      action: "VALIDATE",
      resultingStatus: "VALIDATED",
      validatedAt: input.occurredAt,
      validatedBy: input.actorStaffId,
    });

    return {
      created: true,
      mutationId: input.eventId,
      record: currentRowToResponse(current, "VALIDATED", input.occurredAt, input.actorStaffId),
    };
  }

  public async reopen(
    client: TransactionClient,
    input: ChangeClinicalRecordValidationInput,
  ): Promise<ClinicalRecordMutationResult> {
    const target = await lockTarget(client, input.milestoneId, input.healthCenterId);
    assertMutableTarget(target);
    if (target.visit_status !== "CONFIRMED") throw new ClinicalRecordVisitNotConfirmedError();
    const current = await requireCurrentRecord(client, target, input.expectedRevisionId);

    if (current.record_status === "INCOMPLETE") {
      const duplicate = await findLatestValidationEvent(client, current.record_id, "REOPEN");
      if (
        duplicate !== null &&
        duplicate.revision_id === input.expectedRevisionId &&
        duplicate.reason === input.reason
      ) {
        return {
          created: false,
          mutationId: duplicate.event_id,
          record: validationEventToResponse(duplicate),
        };
      }
      throw new ClinicalRecordAlreadyIncompleteError();
    }

    await client.query(
      `UPDATE k1_k6_records
          SET status = 'INCOMPLETE', validated_at = NULL, validated_by = NULL
        WHERE id = $1`,
      [current.record_id],
    );
    await client.query(
      `UPDATE pregnancy_milestones
          SET record_validation_status = 'INCOMPLETE'
        WHERE id = $1`,
      [target.milestone_id],
    );
    await insertValidationEvent(client, {
      ...input,
      recordId: current.record_id,
      action: "REOPEN",
      resultingStatus: "INCOMPLETE",
      validatedAt: null,
      validatedBy: null,
    });

    return {
      created: true,
      mutationId: input.eventId,
      record: currentRowToResponse(current, "INCOMPLETE", null, null),
    };
  }

  public async findValidationMutation(
    client: TransactionClient,
    eventId: string,
    healthCenterId: string,
  ): Promise<ClinicalRecordResponse | null> {
    const result = await client.query<ValidationEventRow>(
      `${validationEventSelect()}
       WHERE event.id = $1
         AND pregnancy.health_center_id = $2
       LIMIT 1`,
      [eventId, healthCenterId],
    );
    const row = result.rows[0];
    return row === undefined ? null : validationEventToResponse(row);
  }
}

async function lockTarget(
  client: TransactionClient,
  milestoneId: string,
  healthCenterId: string,
): Promise<ClinicalRecordTargetRow> {
  const result = await client.query<ClinicalRecordTargetRow>(
    `SELECT milestone.id AS milestone_id,
            milestone.pregnancy_id,
            milestone.code,
            pregnancy.status AS pregnancy_status,
            milestone.visit_status,
            milestone.record_validation_status AS milestone_validation_status
       FROM pregnancy_milestones AS milestone
       JOIN pregnancies AS pregnancy ON pregnancy.id = milestone.pregnancy_id
      WHERE milestone.id = $1
        AND pregnancy.health_center_id = $2
        AND milestone.code IN ('K1', 'K2', 'K3', 'K4', 'K5', 'K6')
      FOR UPDATE OF pregnancy, milestone`,
    [milestoneId, healthCenterId],
  );
  const row = result.rows[0];
  if (row === undefined) throw new ClinicalRecordTargetUnavailableError();
  return row;
}

async function lockCurrentRecord(
  client: TransactionClient,
  target: ClinicalRecordTargetRow,
): Promise<CurrentClinicalRecordRow | null> {
  const result = await client.query<CurrentClinicalRecordRow>(
    `${currentRecordSelect()}
     WHERE record.milestone_id = $1
     FOR UPDATE OF record`,
    [target.milestone_id],
  );
  return result.rows[0] ?? null;
}

async function requireCurrentRecord(
  client: TransactionClient,
  target: ClinicalRecordTargetRow,
  expectedRevisionId: string,
): Promise<CurrentClinicalRecordRow> {
  const current = await lockCurrentRecord(client, target);
  if (current === null) throw new ClinicalRecordNotFoundError();
  assertCurrentRecordConsistent(current, target);
  if (current.revision_id !== expectedRevisionId) throw new ClinicalRecordRevisionChangedError();
  return current;
}

function assertMutableTarget(target: ClinicalRecordTargetRow): void {
  if (target.pregnancy_status !== "ACTIVE") throw new ClinicalRecordPregnancyNotActiveError();
  if (target.visit_status === "CANCELLED" || target.visit_status === "NOT_APPLICABLE") {
    throw new ClinicalRecordMilestoneTerminalError();
  }
}

function assertCurrentRecordConsistent(
  current: CurrentClinicalRecordRow,
  target: ClinicalRecordTargetRow,
): void {
  if (
    current.revision_id === null ||
    current.revision_no === null ||
    current.record_status !== target.milestone_validation_status
  ) {
    throw new ClinicalRecordHistoryMissingError();
  }
}

function requireRevisionNumber(current: CurrentClinicalRecordRow): number {
  if (current.revision_no === null) throw new ClinicalRecordHistoryMissingError();
  return current.revision_no;
}

async function insertValidationEvent(
  client: TransactionClient,
  input: ChangeClinicalRecordValidationInput & {
    readonly recordId: string;
    readonly action: "VALIDATE" | "REOPEN";
    readonly resultingStatus: "INCOMPLETE" | "VALIDATED";
    readonly validatedAt: Date | null;
    readonly validatedBy: string | null;
  },
): Promise<void> {
  await client.query(
    `INSERT INTO record_validation_events (
       id, record_id, action, actor_staff_id, reason, created_at,
       revision_id, resulting_status, validated_at_snapshot, validated_by_snapshot
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
      input.eventId,
      input.recordId,
      input.action,
      input.actorStaffId,
      input.reason,
      input.occurredAt,
      input.expectedRevisionId,
      input.resultingStatus,
      input.validatedAt,
      input.validatedBy,
    ],
  );
}

async function findLatestValidationEvent(
  client: TransactionClient,
  recordId: string,
  action: "VALIDATE" | "REOPEN",
): Promise<ValidationEventRow | null> {
  const result = await client.query<ValidationEventRow>(
    `${validationEventSelect()}
     WHERE event.record_id = $1
       AND event.action = $2
     ORDER BY event.created_at DESC, event.id DESC
     LIMIT 1`,
    [recordId, action],
  );
  return result.rows[0] ?? null;
}

function readRecordSelect(): string {
  return `SELECT milestone.id AS milestone_id,
                 milestone.pregnancy_id,
                 milestone.code,
                 milestone.record_validation_status AS milestone_validation_status,
                 record.id AS record_id,
                 record.schema_version,
                 record.record_payload,
                 record.status AS record_status,
                 record.validated_at,
                 record.validated_by,
                 revision.id AS revision_id,
                 revision.revision_no
            FROM pregnancy_milestones AS milestone
            JOIN pregnancies AS pregnancy ON pregnancy.id = milestone.pregnancy_id
            LEFT JOIN k1_k6_records AS record ON record.milestone_id = milestone.id
            LEFT JOIN LATERAL (
              SELECT candidate.id, candidate.revision_no
                FROM k1_k6_record_revisions AS candidate
               WHERE candidate.record_id = record.id
               ORDER BY candidate.revision_no DESC
               LIMIT 1
            ) AS revision ON true`;
}

function currentRecordSelect(): string {
  return `SELECT record.id AS record_id,
                 record.milestone_id,
                 milestone.pregnancy_id,
                 milestone.code,
                 record.schema_version,
                 record.record_payload,
                 record.status AS record_status,
                 record.validated_at,
                 record.validated_by,
                 revision.id AS revision_id,
                 revision.revision_no
            FROM k1_k6_records AS record
            JOIN pregnancy_milestones AS milestone ON milestone.id = record.milestone_id
            LEFT JOIN LATERAL (
              SELECT candidate.id, candidate.revision_no
                FROM k1_k6_record_revisions AS candidate
               WHERE candidate.record_id = record.id
               ORDER BY candidate.revision_no DESC
               LIMIT 1
            ) AS revision ON true`;
}

function revisionMutationSelect(): string {
  return `SELECT record.id AS record_id,
                 record.milestone_id,
                 milestone.pregnancy_id,
                 milestone.code,
                 revision.id AS revision_id,
                 revision.revision_no,
                 revision.schema_version,
                 revision.record_payload
            FROM k1_k6_record_revisions AS revision
            JOIN k1_k6_records AS record ON record.id = revision.record_id
            JOIN pregnancy_milestones AS milestone ON milestone.id = record.milestone_id
            JOIN pregnancies AS pregnancy ON pregnancy.id = milestone.pregnancy_id`;
}

function validationEventSelect(): string {
  return `SELECT event.id AS event_id,
                 record.id AS record_id,
                 record.milestone_id,
                 milestone.pregnancy_id,
                 milestone.code,
                 revision.id AS revision_id,
                 revision.revision_no,
                 revision.schema_version,
                 revision.record_payload,
                 event.action,
                 event.reason,
                 event.resulting_status,
                 event.validated_at_snapshot,
                 event.validated_by_snapshot
            FROM record_validation_events AS event
            JOIN k1_k6_records AS record ON record.id = event.record_id
            JOIN k1_k6_record_revisions AS revision
              ON revision.id = event.revision_id
             AND revision.record_id = event.record_id
            JOIN pregnancy_milestones AS milestone ON milestone.id = record.milestone_id
            JOIN pregnancies AS pregnancy ON pregnancy.id = milestone.pregnancy_id`;
}

function currentReadRowToResponse(row: ReadClinicalRecordRow): ClinicalRecordResponse {
  if (
    row.record_id === null ||
    row.schema_version === null ||
    row.record_payload === null ||
    row.record_status === null ||
    row.revision_id === null ||
    row.revision_no === null ||
    row.record_status !== row.milestone_validation_status
  ) {
    throw new ClinicalRecordHistoryMissingError();
  }
  return toResponse({
    record_id: row.record_id,
    milestone_id: row.milestone_id,
    pregnancy_id: row.pregnancy_id,
    code: row.code,
    revision_id: row.revision_id,
    revision_no: row.revision_no,
    schema_version: row.schema_version,
    record_payload: row.record_payload,
    record_validation_status: row.record_status,
    validated_at: row.validated_at,
    validated_by_staff_id: row.validated_by,
  });
}

function currentRowToResponse(
  row: CurrentClinicalRecordRow,
  status: "INCOMPLETE" | "VALIDATED",
  validatedAt: Date | null,
  validatedBy: string | null,
): ClinicalRecordResponse {
  if (row.revision_id === null || row.revision_no === null) {
    throw new ClinicalRecordHistoryMissingError();
  }
  return toResponse({
    record_id: row.record_id,
    milestone_id: row.milestone_id,
    pregnancy_id: row.pregnancy_id,
    code: row.code,
    revision_id: row.revision_id,
    revision_no: row.revision_no,
    schema_version: row.schema_version,
    record_payload: row.record_payload,
    record_validation_status: status,
    validated_at: validatedAt,
    validated_by_staff_id: validatedBy,
  });
}

function revisionRowToResponse(
  row: RevisionMutationRow,
  status: "INCOMPLETE" | "VALIDATED",
  validatedAt: Date | null,
  validatedBy: string | null,
): ClinicalRecordResponse {
  return toResponse({
    record_id: row.record_id,
    milestone_id: row.milestone_id,
    pregnancy_id: row.pregnancy_id,
    code: row.code,
    revision_id: row.revision_id,
    revision_no: row.revision_no,
    schema_version: row.schema_version,
    record_payload: row.record_payload,
    record_validation_status: status,
    validated_at: validatedAt,
    validated_by_staff_id: validatedBy,
  });
}

function validationEventToResponse(row: ValidationEventRow): ClinicalRecordResponse {
  if (row.resulting_status === null) throw new ClinicalRecordHistoryMissingError();
  return revisionRowToResponse(
    row,
    row.resulting_status,
    row.validated_at_snapshot,
    row.validated_by_snapshot,
  );
}

function toResponse(input: {
  readonly record_id: string;
  readonly milestone_id: string;
  readonly pregnancy_id: string;
  readonly code: K1K6MilestoneCode;
  readonly revision_id: string;
  readonly revision_no: number;
  readonly schema_version: string;
  readonly record_payload: ClinicalRecordResponse["record_payload"];
  readonly record_validation_status: "INCOMPLETE" | "VALIDATED";
  readonly validated_at: Date | null;
  readonly validated_by_staff_id: string | null;
}): ClinicalRecordResponse {
  return {
    ...input,
    validated_at: input.validated_at?.toISOString() ?? null,
  };
}
