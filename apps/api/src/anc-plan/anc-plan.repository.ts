import type {
  AncPlanKind,
  AncPlanResponse,
  AncPlanRuleInput,
  AncPlanRuleResponse,
  PregnancyMilestoneListResponse,
  PregnancyMilestoneResponse,
  RuleVersionStatus,
} from "@anc/contracts";
import type { DatabasePool, TransactionClient } from "@anc/database";
import type { QueryResultRow } from "pg";

export interface CreateAncPlanDraftInput {
  readonly planId: string;
  readonly actorStaffId: string;
  readonly sourceReference: string;
  readonly rules: readonly (AncPlanRuleInput & { readonly id: string })[];
}

export interface ApproveAncPlanInput {
  readonly planId: string;
  readonly actorStaffId: string;
  readonly approvalReference: string;
  readonly effectiveFrom: string;
  readonly approvedAt: Date;
}

export interface ActivateAncPlanInput {
  readonly planId: string;
  readonly actorStaffId: string;
  readonly effectiveDate: string;
  readonly activatedAt: Date;
}

export interface AncPlanRepository {
  isClinicalProgramOwner(staffUserId: string): Promise<boolean>;
  findAssignable(): Promise<AncPlanResponse | null>;
  findById(client: TransactionClient, planId: string): Promise<AncPlanResponse | null>;
  createDraft(client: TransactionClient, input: CreateAncPlanDraftInput): Promise<AncPlanResponse>;
  approve(client: TransactionClient, input: ApproveAncPlanInput): Promise<AncPlanResponse>;
  activate(client: TransactionClient, input: ActivateAncPlanInput): Promise<AncPlanResponse>;
  findPregnancyMotherId(pregnancyId: string): Promise<string | null>;
  listPregnancyMilestones(pregnancyId: string): Promise<PregnancyMilestoneListResponse | null>;
}

export class AncPlanNotFoundError extends Error {
  public constructor() {
    super("ANC plan version was not found");
    this.name = "AncPlanNotFoundError";
  }
}

export class AncPlanTransitionError extends Error {
  public constructor() {
    super("ANC plan version is not in the required lifecycle state");
    this.name = "AncPlanTransitionError";
  }
}

export class AncPlanEffectiveDateError extends Error {
  public constructor() {
    super("ANC plan effective date has not been reached");
    this.name = "AncPlanEffectiveDateError";
  }
}

interface PlanRow extends QueryResultRow {
  readonly id: string;
  readonly version_no: number;
  readonly plan_kind: AncPlanKind;
  readonly status: RuleVersionStatus;
  readonly source_reference: string;
  readonly approval_reference: string | null;
  readonly effective_from: string | null;
  readonly approved_by: string | null;
  readonly approved_at: Date | null;
  readonly activated_at: Date | null;
}

interface RuleRow extends QueryResultRow {
  readonly id: string;
  readonly plan_version_id: string;
  readonly code: AncPlanRuleResponse["code"];
  readonly trimester_label: string;
  readonly target_week_start: number | null;
  readonly target_week_end: number | null;
  readonly milestone_category: AncPlanRuleResponse["milestone_category"];
  readonly required_facility_policy: AncPlanRuleResponse["required_facility_policy"];
  readonly allowed_facility_types: AncPlanRuleResponse["allowed_facility_types"];
  readonly reminder_enabled: boolean;
  readonly reminder_interval_days: 3;
}

interface IdRow extends QueryResultRow {
  readonly id: string;
}

interface AllowedRow extends QueryResultRow {
  readonly allowed: boolean;
}

interface VersionRow extends QueryResultRow {
  readonly version_no: number;
}

interface PlanStateRow extends QueryResultRow {
  readonly plan_kind: AncPlanKind;
  readonly status: RuleVersionStatus;
  readonly effective_from: string | null;
}

interface MilestoneHeaderRow extends QueryResultRow {
  readonly pregnancy_id: string;
  readonly mother_id: string;
  readonly care_plan_version_id: string;
  readonly version_no: number;
  readonly plan_kind: AncPlanKind;
  readonly plan_status: RuleVersionStatus;
}

interface MilestoneRow extends QueryResultRow {
  readonly id: string;
  readonly pregnancy_id: string;
  readonly rule_id: string;
  readonly code: PregnancyMilestoneResponse["code"];
  readonly trimester_label: string;
  readonly target_week_start: number | null;
  readonly target_week_end: number | null;
  readonly milestone_category: PregnancyMilestoneResponse["milestone_category"];
  readonly required_facility_policy: PregnancyMilestoneResponse["required_facility_policy"];
  readonly allowed_facility_types: PregnancyMilestoneResponse["allowed_facility_types"];
  readonly reminder_enabled: boolean;
  readonly reminder_interval_days: 3;
  readonly due_at: Date | null;
  readonly visit_status: PregnancyMilestoneResponse["visit_status"];
  readonly record_validation_status: PregnancyMilestoneResponse["record_validation_status"];
}

export class PostgresAncPlanRepository implements AncPlanRepository {
  public constructor(
    private readonly pool: DatabasePool,
    private readonly allowSyntheticPlan: boolean,
  ) {}

  public async isClinicalProgramOwner(staffUserId: string): Promise<boolean> {
    const result = await this.pool.query<AllowedRow>(
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

  public async findAssignable(): Promise<AncPlanResponse | null> {
    const result = await this.pool.query<IdRow>(
      `SELECT id
         FROM anc_plan_versions
        WHERE (plan_kind = 'CLINICAL' AND status = 'ACTIVE')
           OR ($1::boolean AND plan_kind = 'SYNTHETIC' AND status = 'DRAFT')
        ORDER BY
          CASE WHEN plan_kind = 'CLINICAL' AND status = 'ACTIVE' THEN 0 ELSE 1 END,
          version_no DESC
        LIMIT 1`,
      [this.allowSyntheticPlan],
    );
    const id = result.rows[0]?.id;
    return id === undefined ? null : loadPlan(this.pool, id);
  }

  public findById(client: TransactionClient, planId: string): Promise<AncPlanResponse | null> {
    return loadPlan(client, planId);
  }

  public async createDraft(
    client: TransactionClient,
    input: CreateAncPlanDraftInput,
  ): Promise<AncPlanResponse> {
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [
      "ANC_PLAN_VERSION_ALLOCATION",
    ]);
    const next = await client.query<VersionRow>(
      `SELECT COALESCE(MAX(version_no), 0)::int + 1 AS version_no
         FROM anc_plan_versions`,
    );
    const versionNo = next.rows[0]?.version_no;
    if (versionNo === undefined) throw new Error("ANC plan version allocation failed");

    await client.query(
      `INSERT INTO anc_plan_versions (
         id, version_no, plan_kind, status, source_reference, created_by
       ) VALUES ($1, $2, 'CLINICAL', 'DRAFT', $3, $4)`,
      [input.planId, versionNo, input.sourceReference, input.actorStaffId],
    );
    for (const rule of input.rules) {
      await client.query(
        `INSERT INTO anc_milestone_rules (
           id,
           plan_version_id,
           code,
           trimester_label,
           target_week_start,
           target_week_end,
           milestone_category,
           required_facility_policy,
           allowed_facility_types,
           reminder_enabled,
           reminder_interval_days
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, 3)`,
        [
          rule.id,
          input.planId,
          rule.code,
          rule.trimester_label,
          rule.target_week_start,
          rule.target_week_end,
          rule.milestone_category,
          rule.required_facility_policy,
          JSON.stringify(rule.allowed_facility_types),
          rule.reminder_enabled,
        ],
      );
    }
    return requirePlan(await loadPlan(client, input.planId));
  }

  public async approve(
    client: TransactionClient,
    input: ApproveAncPlanInput,
  ): Promise<AncPlanResponse> {
    await requireClinicalProgramOwner(client, input.actorStaffId);
    const state = await lockPlanState(client, input.planId);
    if (state.plan_kind !== "CLINICAL" || state.status !== "DRAFT") {
      throw new AncPlanTransitionError();
    }
    await client.query(
      `UPDATE anc_plan_versions
          SET status = 'APPROVED',
              approval_reference = $2,
              approved_by = $3,
              approved_at = $4,
              effective_from = $5
        WHERE id = $1`,
      [
        input.planId,
        input.approvalReference,
        input.actorStaffId,
        input.approvedAt,
        input.effectiveFrom,
      ],
    );
    return requirePlan(await loadPlan(client, input.planId));
  }

  public async activate(
    client: TransactionClient,
    input: ActivateAncPlanInput,
  ): Promise<AncPlanResponse> {
    await requireClinicalProgramOwner(client, input.actorStaffId);
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [
      "ANC_PLAN_ACTIVATION",
    ]);
    const state = await lockPlanState(client, input.planId);
    if (state.plan_kind !== "CLINICAL" || state.status !== "APPROVED") {
      throw new AncPlanTransitionError();
    }
    if (state.effective_from === null || state.effective_from > input.effectiveDate) {
      throw new AncPlanEffectiveDateError();
    }
    await client.query(
      `UPDATE anc_plan_versions
          SET status = 'ARCHIVED'
        WHERE status = 'ACTIVE' AND id <> $1`,
      [input.planId],
    );
    await client.query(
      `UPDATE anc_plan_versions
          SET status = 'ACTIVE', activated_at = $2
        WHERE id = $1`,
      [input.planId, input.activatedAt],
    );
    return requirePlan(await loadPlan(client, input.planId));
  }

  public async findPregnancyMotherId(pregnancyId: string): Promise<string | null> {
    const result = await this.pool.query<MilestoneHeaderRow>(
      `SELECT
         pregnancy.id AS pregnancy_id,
         pregnancy.mother_id,
         pregnancy.care_plan_version_id,
         plan.version_no,
         plan.plan_kind,
         plan.status AS plan_status
       FROM pregnancies AS pregnancy
       JOIN anc_plan_versions AS plan ON plan.id = pregnancy.care_plan_version_id
       WHERE pregnancy.id = $1
       LIMIT 1`,
      [pregnancyId],
    );
    return result.rows[0]?.mother_id ?? null;
  }

  public async listPregnancyMilestones(
    pregnancyId: string,
  ): Promise<PregnancyMilestoneListResponse | null> {
    const headerResult = await this.pool.query<MilestoneHeaderRow>(
      `SELECT
         pregnancy.id AS pregnancy_id,
         pregnancy.mother_id,
         pregnancy.care_plan_version_id,
         plan.version_no,
         plan.plan_kind,
         plan.status AS plan_status
       FROM pregnancies AS pregnancy
       JOIN anc_plan_versions AS plan ON plan.id = pregnancy.care_plan_version_id
       WHERE pregnancy.id = $1
       LIMIT 1`,
      [pregnancyId],
    );
    const header = headerResult.rows[0];
    if (header === undefined) return null;

    const milestoneResult = await this.pool.query<MilestoneRow>(
      `SELECT
         milestone.id,
         milestone.pregnancy_id,
         milestone.rule_id,
         milestone.code,
         rule.trimester_label,
         rule.target_week_start,
         rule.target_week_end,
         rule.milestone_category,
         rule.required_facility_policy,
         rule.allowed_facility_types,
         rule.reminder_enabled,
         rule.reminder_interval_days,
         milestone.due_at,
         milestone.visit_status,
         milestone.record_validation_status
       FROM pregnancy_milestones AS milestone
       JOIN anc_milestone_rules AS rule
         ON rule.id = milestone.rule_id
        AND rule.plan_version_id = milestone.plan_version_id
        AND rule.code = milestone.code
       WHERE milestone.pregnancy_id = $1
       ORDER BY milestone.code`,
      [pregnancyId],
    );

    return {
      pregnancy_id: header.pregnancy_id,
      care_plan_version_id: header.care_plan_version_id,
      plan_version_no: header.version_no,
      plan_kind: header.plan_kind,
      production_eligible: header.plan_kind === "CLINICAL" && header.plan_status === "ACTIVE",
      milestones: milestoneResult.rows.map(toMilestoneResponse),
    };
  }
}

async function loadPlan(
  client: Pick<TransactionClient, "query">,
  planId: string,
): Promise<AncPlanResponse | null> {
  const planResult = await client.query<PlanRow>(
    `SELECT
       id,
       version_no,
       plan_kind,
       status,
       source_reference,
       approval_reference,
       effective_from::text AS effective_from,
       approved_by,
       approved_at,
       activated_at
     FROM anc_plan_versions
     WHERE id = $1
     LIMIT 1`,
    [planId],
  );
  const plan = planResult.rows[0];
  if (plan === undefined) return null;
  const rules = await client.query<RuleRow>(
    `SELECT
       id,
       plan_version_id,
       code,
       trimester_label,
       target_week_start,
       target_week_end,
       milestone_category,
       required_facility_policy,
       allowed_facility_types,
       reminder_enabled,
       reminder_interval_days
     FROM anc_milestone_rules
     WHERE plan_version_id = $1
     ORDER BY code`,
    [planId],
  );
  return {
    id: plan.id,
    version_no: plan.version_no,
    plan_kind: plan.plan_kind,
    status: plan.status,
    source_reference: plan.source_reference,
    approval_reference: plan.approval_reference,
    effective_from: plan.effective_from,
    approved_by_staff_id: plan.approved_by,
    approved_at: plan.approved_at?.toISOString() ?? null,
    activated_at: plan.activated_at?.toISOString() ?? null,
    production_eligible: plan.plan_kind === "CLINICAL" && plan.status === "ACTIVE",
    rules: rules.rows,
  };
}

async function lockPlanState(client: TransactionClient, planId: string): Promise<PlanStateRow> {
  const result = await client.query<PlanStateRow>(
    `SELECT plan_kind, status, effective_from::text AS effective_from
       FROM anc_plan_versions
      WHERE id = $1
      FOR UPDATE`,
    [planId],
  );
  const state = result.rows[0];
  if (state === undefined) throw new AncPlanNotFoundError();
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
  if (result.rows[0] === undefined) throw new AncPlanNotFoundError();
}

function requirePlan(plan: AncPlanResponse | null): AncPlanResponse {
  if (plan === null) throw new Error("ANC plan disappeared during mutation");
  return plan;
}

function toMilestoneResponse(row: MilestoneRow): PregnancyMilestoneResponse {
  return {
    id: row.id,
    pregnancy_id: row.pregnancy_id,
    rule_id: row.rule_id,
    code: row.code,
    trimester_label: row.trimester_label,
    target_week_start: row.target_week_start,
    target_week_end: row.target_week_end,
    milestone_category: row.milestone_category,
    required_facility_policy: row.required_facility_policy,
    allowed_facility_types: row.allowed_facility_types,
    reminder_enabled: row.reminder_enabled,
    reminder_interval_days: row.reminder_interval_days,
    due_at: row.due_at?.toISOString() ?? null,
    visit_status: row.visit_status,
    record_validation_status: row.record_validation_status,
  };
}
