import { randomUUID } from "node:crypto";
import {
  ancPlanCreateRequestSchema,
  type AncPlanKind,
  type AncPlanRuleResponse,
} from "@anc/contracts";
import type { TransactionClient } from "@anc/database";
import type { QueryResultRow } from "pg";

export interface AssignableAncPlan {
  readonly id: string;
  readonly versionNo: number;
  readonly planKind: AncPlanKind;
  readonly productionEligible: boolean;
  readonly rules: readonly AncPlanRuleResponse[];
}

export class ActiveAncPlanUnavailableError extends Error {
  public constructor() {
    super("No assignable ANC plan version is available");
    this.name = "ActiveAncPlanUnavailableError";
  }
}

export class ActiveAncPlanInvalidError extends Error {
  public constructor() {
    super("The assignable ANC plan does not contain a valid K1-K8 rule set");
    this.name = "ActiveAncPlanInvalidError";
  }
}

interface PlanRow extends QueryResultRow {
  readonly id: string;
  readonly version_no: number;
  readonly plan_kind: AncPlanKind;
  readonly status: "DRAFT" | "ACTIVE";
  readonly source_reference: string;
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

export async function resolveAssignableAncPlan(
  client: TransactionClient,
  allowSyntheticPlan: boolean,
): Promise<AssignableAncPlan> {
  const planResult = await client.query<PlanRow>(
    `SELECT id, version_no, plan_kind, status, source_reference
       FROM anc_plan_versions
      WHERE (plan_kind = 'CLINICAL' AND status = 'ACTIVE')
         OR ($1::boolean AND plan_kind = 'SYNTHETIC' AND status = 'DRAFT')
      ORDER BY
        CASE WHEN plan_kind = 'CLINICAL' AND status = 'ACTIVE' THEN 0 ELSE 1 END,
        version_no DESC
      LIMIT 1
      FOR KEY SHARE`,
    [allowSyntheticPlan],
  );
  const plan = planResult.rows[0];
  if (plan === undefined) throw new ActiveAncPlanUnavailableError();
  if (plan.plan_kind === "SYNTHETIC" && !allowSyntheticPlan) {
    throw new ActiveAncPlanUnavailableError();
  }

  const rulesResult = await client.query<RuleRow>(
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
    [plan.id],
  );
  const parsed = ancPlanCreateRequestSchema.safeParse({
    idempotency_key: "00000000-0000-4000-8000-000000000001",
    source_reference: plan.source_reference,
    rules: rulesResult.rows.map((rule) => ({
      code: rule.code,
      trimester_label: rule.trimester_label,
      target_week_start: rule.target_week_start,
      target_week_end: rule.target_week_end,
      milestone_category: rule.milestone_category,
      required_facility_policy: rule.required_facility_policy,
      allowed_facility_types: rule.allowed_facility_types,
      reminder_enabled: rule.reminder_enabled,
    })),
  });
  if (!parsed.success || rulesResult.rows.some((rule) => rule.reminder_interval_days !== 3)) {
    throw new ActiveAncPlanInvalidError();
  }

  return {
    id: plan.id,
    versionNo: plan.version_no,
    planKind: plan.plan_kind,
    productionEligible: plan.plan_kind === "CLINICAL" && plan.status === "ACTIVE",
    rules: rulesResult.rows,
  };
}

export async function initializePregnancyMilestones(
  client: TransactionClient,
  pregnancyId: string,
  plan: AssignableAncPlan,
): Promise<void> {
  for (const rule of plan.rules) {
    const result = await client.query(
      `INSERT INTO pregnancy_milestones (
         id,
         pregnancy_id,
         rule_id,
         plan_version_id,
         code,
         due_at,
         visit_status,
         record_validation_status
       ) VALUES (
         $1, $2, $3, $4, $5, NULL, 'UPCOMING', $6
       )`,
      [
        randomUUID(),
        pregnancyId,
        rule.id,
        plan.id,
        rule.code,
        isDetailedRecordMilestone(rule.code) ? "INCOMPLETE" : "NOT_REQUIRED",
      ],
    );
    if (result.rowCount !== 1) throw new Error("Pregnancy milestone initialization failed");
  }
}

function isDetailedRecordMilestone(code: AncPlanRuleResponse["code"]): boolean {
  return code !== "K7" && code !== "K8";
}
