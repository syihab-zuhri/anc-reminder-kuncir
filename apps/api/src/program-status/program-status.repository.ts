import type {
  ProgramAssessmentEntry,
  ProgramEvidenceMilestoneCode,
  ProgramRuleRequirementInput,
  ProgramRuleVersionResponse,
  RuleVersionStatus,
} from "@anc/contracts";
import type { DatabasePool, TransactionClient } from "@anc/database";
import type { QueryResultRow } from "pg";

import type { ProgramEvidenceSnapshot } from "./program-status.evaluator.js";

type Queryable = Pick<TransactionClient, "query">;
export type ProgramStatusQueryRunner = Queryable;

export interface CreateProgramRuleDraftInput {
  readonly ruleId: string;
  readonly actorStaffId: string;
  readonly sourceReference: string;
  readonly requirements: readonly (ProgramRuleRequirementInput & { readonly id: string })[];
}

export interface ApproveProgramRuleInput {
  readonly ruleId: string;
  readonly actorStaffId: string;
  readonly approvalReference: string;
  readonly effectiveFrom: string;
  readonly approvedAt: Date;
}

export interface ActivateProgramRuleInput {
  readonly ruleId: string;
  readonly actorStaffId: string;
  readonly effectiveDate: string;
  readonly activatedAt: Date;
}

export interface SaveProgramAssessmentInput {
  readonly assessmentId: string;
  readonly pregnancyId: string;
  readonly ruleVersionId: string;
  readonly sigiziKesgaRecordingStatus: "IN_PROGRESS" | "COMPLETE";
  readonly fetalRightsStatus: "NOT_YET_MET" | "MET";
  readonly evidence: ProgramAssessmentEntry["evidence"];
  readonly evaluatedAt: Date;
  readonly evaluatedByType: "SYSTEM" | "STAFF";
  readonly evaluatedByStaffId: string | null;
}

export interface PregnancyScope {
  readonly motherId: string;
  readonly healthCenterId: string;
}

export interface ProgramStatusRepository {
  queryRunner(): ProgramStatusQueryRunner;
  isClinicalProgramOwner(staffUserId: string): Promise<boolean>;
  createDraft(
    client: TransactionClient,
    input: CreateProgramRuleDraftInput,
  ): Promise<ProgramRuleVersionResponse>;
  approve(
    client: TransactionClient,
    input: ApproveProgramRuleInput,
  ): Promise<ProgramRuleVersionResponse>;
  activate(
    client: TransactionClient,
    input: ActivateProgramRuleInput,
  ): Promise<ProgramRuleVersionResponse>;
  findById(client: Queryable, ruleId: string): Promise<ProgramRuleVersionResponse | null>;
  findActiveRule(client: Queryable): Promise<ProgramRuleVersionResponse | null>;
  findPregnancyScope(pregnancyId: string): Promise<PregnancyScope | null>;
  findPregnancyIdByMilestone(milestoneId: string): Promise<string | null>;
  collectEvidence(client: Queryable, pregnancyId: string): Promise<ProgramEvidenceSnapshot>;
  latestAssessment(client: Queryable, pregnancyId: string): Promise<ProgramAssessmentEntry | null>;
  listAssessments(pregnancyId: string): Promise<ProgramAssessmentEntry[]>;
  findAssessmentById(
    client: Queryable,
    assessmentId: string,
  ): Promise<ProgramAssessmentEntry | null>;
  saveAssessment(client: TransactionClient, input: SaveProgramAssessmentInput): Promise<void>;
  withTransaction<T>(work: (client: TransactionClient) => Promise<T>): Promise<T>;
}

export class ProgramRuleNotFoundError extends Error {
  public constructor() {
    super("Program rule version was not found");
    this.name = "ProgramRuleNotFoundError";
  }
}

export class ProgramRuleTransitionError extends Error {
  public constructor() {
    super("Program rule version is not in the required lifecycle state");
    this.name = "ProgramRuleTransitionError";
  }
}

export class ProgramRuleEffectiveDateError extends Error {
  public constructor() {
    super("Program rule effective date has not been reached");
    this.name = "ProgramRuleEffectiveDateError";
  }
}

interface RuleRow extends QueryResultRow {
  readonly id: string;
  readonly version_no: number;
  readonly status: RuleVersionStatus;
  readonly source_reference: string;
  readonly approval_reference: string | null;
  readonly effective_from: string | null;
  readonly approved_by: string | null;
  readonly approved_at: Date | null;
  readonly activated_at: Date | null;
}

interface RequirementRow extends QueryResultRow {
  readonly id: string;
  readonly program_rule_version_id: string;
  readonly requirement_type: ProgramRuleRequirementInput["requirement_type"];
  readonly milestone_code: ProgramEvidenceMilestoneCode | null;
  readonly rule_config: { readonly field_key?: string };
}

interface RuleStateRow extends QueryResultRow {
  readonly status: RuleVersionStatus;
  readonly effective_from: string | null;
}

interface IdRow extends QueryResultRow {
  readonly id: string;
}

interface VersionRow extends QueryResultRow {
  readonly version_no: number;
}

interface ScopeRow extends QueryResultRow {
  readonly mother_id: string;
  readonly health_center_id: string;
}

interface ValidatedMilestoneRow extends QueryResultRow {
  readonly code: ProgramEvidenceMilestoneCode;
}

interface RecordPayloadRow extends QueryResultRow {
  readonly code: ProgramEvidenceMilestoneCode;
  readonly record_payload: Record<string, unknown>;
}

interface AssessmentRow extends QueryResultRow {
  readonly id: string;
  readonly pregnancy_id: string;
  readonly rule_version_id: string;
  readonly rule_version_no: number;
  readonly sigizi_kesga_recording_status: ProgramAssessmentEntry["sigizi_kesga_recording_status"];
  readonly fetal_rights_status: ProgramAssessmentEntry["fetal_rights_status"];
  readonly evidence_summary: ProgramAssessmentEntry["evidence"];
  readonly evaluated_at: Date;
  readonly evaluated_by_type: ProgramAssessmentEntry["evaluated_by_type"];
  readonly evaluated_by_staff_id: string | null;
}

const EVIDENCE_MILESTONE_CODES = ["K1", "K2", "K3", "K4", "K5", "K6"] as const;

export class PostgresProgramStatusRepository implements ProgramStatusRepository {
  public constructor(private readonly pool: DatabasePool) {}

  public queryRunner(): ProgramStatusQueryRunner {
    return this.pool;
  }

  public async isClinicalProgramOwner(staffUserId: string): Promise<boolean> {
    const result = await this.pool.query<{ readonly allowed: boolean }>(
      `SELECT EXISTS (
         SELECT 1
           FROM staff_users
          WHERE id = $1
            AND role = 'PUSKESMAS'
            AND status = 'ACTIVE'
            AND clinical_program_owner = true
       ) AS allowed`,
      [staffUserId],
    );
    return result.rows[0]?.allowed === true;
  }

  public async createDraft(
    client: TransactionClient,
    input: CreateProgramRuleDraftInput,
  ): Promise<ProgramRuleVersionResponse> {
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [
      "PROGRAM_RULE_VERSION_ALLOCATION",
    ]);
    const next = await client.query<VersionRow>(
      `SELECT COALESCE(MAX(version_no), 0)::int + 1 AS version_no
         FROM program_rule_versions`,
    );
    const versionNo = next.rows[0]?.version_no;
    if (versionNo === undefined) throw new Error("Program rule version allocation failed");

    await client.query(
      `INSERT INTO program_rule_versions (
         id, version_no, status, source_reference, created_by
       ) VALUES ($1, $2, 'DRAFT', $3, $4)`,
      [input.ruleId, versionNo, input.sourceReference, input.actorStaffId],
    );
    for (const requirement of input.requirements) {
      await client.query(
        `INSERT INTO program_rule_requirements (
           id, program_rule_version_id, requirement_type, milestone_code, rule_config
         ) VALUES ($1, $2, $3, $4, $5::jsonb)`,
        [
          requirement.id,
          input.ruleId,
          requirement.requirement_type,
          requirement.milestone_code,
          JSON.stringify(
            requirement.requirement_type === "FIELD_PRESENT"
              ? { field_key: requirement.field_key }
              : {},
          ),
        ],
      );
    }
    return requireRule(await this.findById(client, input.ruleId));
  }

  public async approve(
    client: TransactionClient,
    input: ApproveProgramRuleInput,
  ): Promise<ProgramRuleVersionResponse> {
    await requireClinicalProgramOwner(client, input.actorStaffId);
    const state = await lockRuleState(client, input.ruleId);
    if (state.status !== "DRAFT") {
      throw new ProgramRuleTransitionError();
    }
    await client.query(
      `UPDATE program_rule_versions
          SET status = 'APPROVED',
              approval_reference = $2,
              approved_by = $3,
              approved_at = $4,
              effective_from = $5
        WHERE id = $1`,
      [
        input.ruleId,
        input.approvalReference,
        input.actorStaffId,
        input.approvedAt,
        input.effectiveFrom,
      ],
    );
    return requireRule(await this.findById(client, input.ruleId));
  }

  public async activate(
    client: TransactionClient,
    input: ActivateProgramRuleInput,
  ): Promise<ProgramRuleVersionResponse> {
    await requireClinicalProgramOwner(client, input.actorStaffId);
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [
      "PROGRAM_RULE_ACTIVATION",
    ]);
    const state = await lockRuleState(client, input.ruleId);
    if (state.status !== "APPROVED") {
      throw new ProgramRuleTransitionError();
    }
    if (state.effective_from === null || state.effective_from > input.effectiveDate) {
      throw new ProgramRuleEffectiveDateError();
    }
    await client.query(
      `UPDATE program_rule_versions
          SET status = 'ARCHIVED'
        WHERE status = 'ACTIVE' AND id <> $1`,
      [input.ruleId],
    );
    await client.query(
      `UPDATE program_rule_versions
          SET status = 'ACTIVE', activated_at = $2
        WHERE id = $1`,
      [input.ruleId, input.activatedAt],
    );
    return requireRule(await this.findById(client, input.ruleId));
  }

  public async findById(
    client: Queryable,
    ruleId: string,
  ): Promise<ProgramRuleVersionResponse | null> {
    const result = await client.query<RuleRow>(
      `SELECT
         id,
         version_no,
         status,
         source_reference,
         approval_reference,
         effective_from::text AS effective_from,
         approved_by,
         approved_at,
         activated_at
       FROM program_rule_versions
       WHERE id = $1
       LIMIT 1`,
      [ruleId],
    );
    const rule = result.rows[0];
    if (rule === undefined) return null;
    return toRuleResponse(rule, await loadRequirements(client, ruleId));
  }

  public async findActiveRule(client: Queryable): Promise<ProgramRuleVersionResponse | null> {
    const result = await client.query<IdRow>(
      `SELECT id
         FROM program_rule_versions
        WHERE status = 'ACTIVE'
        LIMIT 1`,
    );
    const id = result.rows[0]?.id;
    return id === undefined ? null : this.findById(client, id);
  }

  public async findPregnancyScope(pregnancyId: string): Promise<PregnancyScope | null> {
    const result = await this.pool.query<ScopeRow>(
      `SELECT mother_id, health_center_id
         FROM pregnancies
        WHERE id = $1
        LIMIT 1`,
      [pregnancyId],
    );
    const row = result.rows[0];
    if (row === undefined) return null;
    return { motherId: row.mother_id, healthCenterId: row.health_center_id };
  }

  public async findPregnancyIdByMilestone(milestoneId: string): Promise<string | null> {
    const result = await this.pool.query<{ readonly pregnancy_id: string }>(
      `SELECT pregnancy_id
         FROM pregnancy_milestones
        WHERE id = $1
        LIMIT 1`,
      [milestoneId],
    );
    return result.rows[0]?.pregnancy_id ?? null;
  }

  public async collectEvidence(
    client: Queryable,
    pregnancyId: string,
  ): Promise<ProgramEvidenceSnapshot> {
    const validatedResult = await client.query<ValidatedMilestoneRow>(
      `SELECT code
         FROM pregnancy_milestones
        WHERE pregnancy_id = $1
          AND code = ANY($2::milestone_code[])
          AND record_validation_status = 'VALIDATED'
        ORDER BY code`,
      [pregnancyId, EVIDENCE_MILESTONE_CODES],
    );
    const payloadResult = await client.query<RecordPayloadRow>(
      `SELECT milestone.code, revision.record_payload
         FROM pregnancy_milestones AS milestone
         JOIN k1_k6_records AS record ON record.milestone_id = milestone.id
         JOIN LATERAL (
           SELECT latest.record_payload
             FROM k1_k6_record_revisions AS latest
            WHERE latest.record_id = record.id
            ORDER BY latest.revision_no DESC
            LIMIT 1
         ) AS revision ON true
        WHERE milestone.pregnancy_id = $1
          AND milestone.code = ANY($2::milestone_code[])`,
      [pregnancyId, EVIDENCE_MILESTONE_CODES],
    );

    const recordFields = new Map<string, Set<string>>();
    for (const row of payloadResult.rows) {
      const fields = new Set<string>();
      for (const [key, value] of Object.entries(row.record_payload)) {
        if (isPresentValue(value)) fields.add(key);
      }
      recordFields.set(row.code, fields);
    }

    return {
      validatedMilestones: validatedResult.rows.map((row) => row.code),
      recordFields,
    };
  }

  public latestAssessment(
    client: Queryable,
    pregnancyId: string,
  ): Promise<ProgramAssessmentEntry | null> {
    return loadAssessment(
      client,
      `SELECT
         assessment.id,
         assessment.pregnancy_id,
         assessment.rule_version_id,
         rule.version_no AS rule_version_no,
         assessment.sigizi_kesga_recording_status,
         assessment.fetal_rights_status,
         assessment.evidence_summary,
         assessment.evaluated_at,
         assessment.evaluated_by_type,
         assessment.evaluated_by_staff_id
       FROM program_assessments AS assessment
       JOIN program_rule_versions AS rule ON rule.id = assessment.rule_version_id
       WHERE assessment.pregnancy_id = $1
       ORDER BY assessment.evaluated_at DESC, assessment.id DESC
       LIMIT 1`,
      [pregnancyId],
    );
  }

  public async listAssessments(pregnancyId: string): Promise<ProgramAssessmentEntry[]> {
    const result = await this.pool.query<AssessmentRow>(
      `SELECT
         assessment.id,
         assessment.pregnancy_id,
         assessment.rule_version_id,
         rule.version_no AS rule_version_no,
         assessment.sigizi_kesga_recording_status,
         assessment.fetal_rights_status,
         assessment.evidence_summary,
         assessment.evaluated_at,
         assessment.evaluated_by_type,
         assessment.evaluated_by_staff_id
       FROM program_assessments AS assessment
       JOIN program_rule_versions AS rule ON rule.id = assessment.rule_version_id
       WHERE assessment.pregnancy_id = $1
       ORDER BY assessment.evaluated_at DESC, assessment.id DESC
       LIMIT 100`,
      [pregnancyId],
    );
    return result.rows.map(toAssessmentEntry);
  }

  public findAssessmentById(
    client: Queryable,
    assessmentId: string,
  ): Promise<ProgramAssessmentEntry | null> {
    return loadAssessment(
      client,
      `SELECT
         assessment.id,
         assessment.pregnancy_id,
         assessment.rule_version_id,
         rule.version_no AS rule_version_no,
         assessment.sigizi_kesga_recording_status,
         assessment.fetal_rights_status,
         assessment.evidence_summary,
         assessment.evaluated_at,
         assessment.evaluated_by_type,
         assessment.evaluated_by_staff_id
       FROM program_assessments AS assessment
       JOIN program_rule_versions AS rule ON rule.id = assessment.rule_version_id
       WHERE assessment.id = $1
       LIMIT 1`,
      [assessmentId],
    );
  }

  public async saveAssessment(
    client: TransactionClient,
    input: SaveProgramAssessmentInput,
  ): Promise<void> {
    await client.query(
      `INSERT INTO program_assessments (
         id,
         pregnancy_id,
         rule_version_id,
         sigizi_kesga_recording_status,
         fetal_rights_status,
         evidence_summary,
         evaluated_at,
         evaluated_by_type,
         evaluated_by_staff_id
       ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9)`,
      [
        input.assessmentId,
        input.pregnancyId,
        input.ruleVersionId,
        input.sigiziKesgaRecordingStatus,
        input.fetalRightsStatus,
        JSON.stringify(input.evidence),
        input.evaluatedAt,
        input.evaluatedByType,
        input.evaluatedByStaffId,
      ],
    );
  }

  public async withTransaction<T>(work: (client: TransactionClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await work(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
}

async function loadRequirements(
  client: Queryable,
  ruleId: string,
): Promise<ProgramRuleVersionResponse["requirements"]> {
  const result = await client.query<RequirementRow>(
    `SELECT id, program_rule_version_id, requirement_type, milestone_code, rule_config
       FROM program_rule_requirements
      WHERE program_rule_version_id = $1
      ORDER BY milestone_code NULLS LAST, requirement_type`,
    [ruleId],
  );
  return result.rows.map((row) => {
    if (row.milestone_code === null) {
      throw new Error("Program requirement is missing its milestone code");
    }
    return {
      id: row.id,
      program_rule_version_id: row.program_rule_version_id,
      requirement_type: row.requirement_type,
      milestone_code: row.milestone_code,
      field_key:
        row.requirement_type === "FIELD_PRESENT" ? (row.rule_config.field_key ?? null) : null,
    };
  });
}

function toRuleResponse(
  rule: RuleRow,
  requirements: ProgramRuleVersionResponse["requirements"],
): ProgramRuleVersionResponse {
  return {
    id: rule.id,
    version_no: rule.version_no,
    status: rule.status,
    source_reference: rule.source_reference,
    approval_reference: rule.approval_reference,
    effective_from: rule.effective_from,
    approved_by_staff_id: rule.approved_by,
    approved_at: rule.approved_at?.toISOString() ?? null,
    activated_at: rule.activated_at?.toISOString() ?? null,
    production_eligible: rule.status === "ACTIVE",
    requirements,
  };
}

async function lockRuleState(client: TransactionClient, ruleId: string): Promise<RuleStateRow> {
  const result = await client.query<RuleStateRow>(
    `SELECT status, effective_from::text AS effective_from
       FROM program_rule_versions
      WHERE id = $1
      FOR UPDATE`,
    [ruleId],
  );
  const state = result.rows[0];
  if (state === undefined) throw new ProgramRuleNotFoundError();
  return state;
}

async function requireClinicalProgramOwner(
  client: TransactionClient,
  staffUserId: string,
): Promise<void> {
  const result = await client.query<IdRow>(
    `SELECT id
       FROM staff_users
      WHERE id = $1
        AND role = 'PUSKESMAS'
        AND status = 'ACTIVE'
        AND clinical_program_owner = true
      FOR KEY SHARE`,
    [staffUserId],
  );
  if (result.rows[0] === undefined) throw new ProgramRuleNotFoundError();
}

async function loadAssessment(
  client: Queryable,
  sql: string,
  params: string[],
): Promise<ProgramAssessmentEntry | null> {
  const result = await client.query<AssessmentRow>(sql, params);
  const row = result.rows[0];
  return row === undefined ? null : toAssessmentEntry(row);
}

function toAssessmentEntry(row: AssessmentRow): ProgramAssessmentEntry {
  return {
    id: row.id,
    pregnancy_id: row.pregnancy_id,
    rule_version_id: row.rule_version_id,
    rule_version_no: row.rule_version_no,
    sigizi_kesga_recording_status: row.sigizi_kesga_recording_status,
    fetal_rights_status: row.fetal_rights_status,
    evidence: row.evidence_summary,
    evaluated_at: row.evaluated_at.toISOString(),
    evaluated_by_type: row.evaluated_by_type,
    evaluated_by_staff_id: row.evaluated_by_staff_id,
  };
}

function requireRule(rule: ProgramRuleVersionResponse | null): ProgramRuleVersionResponse {
  if (rule === null) throw new Error("Program rule disappeared during mutation");
  return rule;
}

function isPresentValue(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}
