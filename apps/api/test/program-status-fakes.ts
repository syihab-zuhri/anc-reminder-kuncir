/* eslint-disable @typescript-eslint/require-await -- in-memory ports intentionally satisfy async interfaces */
import type {
  ProgramAssessmentEntry,
  ProgramRuleRequirementInput,
  ProgramRuleVersionResponse,
  RuleVersionStatus,
} from "@anc/contracts";
import type { TransactionClient } from "@anc/database";

import type { ProgramEvidenceSnapshot } from "../src/program-status/program-status.evaluator.js";
import {
  ProgramRuleEffectiveDateError,
  ProgramRuleNotFoundError,
  ProgramRuleTransitionError,
  type PregnancyScope,
  type ProgramStatusQueryRunner,
  type ProgramStatusRepository,
} from "../src/program-status/program-status.repository.js";

interface FakeRuleVersion {
  id: string;
  version_no: number;
  status: RuleVersionStatus;
  source_reference: string;
  approval_reference: string | null;
  effective_from: string | null;
  approved_by: string | null;
  approved_at: Date | null;
  activated_at: Date | null;
  requirements: (ProgramRuleRequirementInput & { readonly id: string })[];
}

export class FakeProgramStatusRepository implements ProgramStatusRepository {
  public readonly clinicalOwnerIds = new Set<string>();
  public readonly pregnancies = new Map<string, PregnancyScope>();
  public readonly milestonePregnancies = new Map<string, string>();
  public readonly evidenceByPregnancy = new Map<string, ProgramEvidenceSnapshot>();
  public readonly assessments: ProgramAssessmentEntry[] = [];
  private readonly rules: FakeRuleVersion[] = [];
  private versionCounter = 0;

  public queryRunner(): ProgramStatusQueryRunner {
    return {} as ProgramStatusQueryRunner;
  }

  public async isClinicalProgramOwner(staffUserId: string): Promise<boolean> {
    return this.clinicalOwnerIds.has(staffUserId);
  }

  public async createDraft(
    client: TransactionClient,
    input: Parameters<ProgramStatusRepository["createDraft"]>[1],
  ): Promise<ProgramRuleVersionResponse> {
    void client;
    this.versionCounter += 1;
    this.rules.push({
      id: input.ruleId,
      version_no: this.versionCounter,
      status: "DRAFT",
      source_reference: input.sourceReference,
      approval_reference: null,
      effective_from: null,
      approved_by: null,
      approved_at: null,
      activated_at: null,
      requirements: [...input.requirements],
    });
    return this.toResponse(input.ruleId);
  }

  public async approve(
    client: TransactionClient,
    input: Parameters<ProgramStatusRepository["approve"]>[1],
  ): Promise<ProgramRuleVersionResponse> {
    void client;
    if (!this.clinicalOwnerIds.has(input.actorStaffId)) throw new ProgramRuleNotFoundError();
    const rule = this.requireRule(input.ruleId);
    if (rule.status !== "DRAFT") throw new ProgramRuleTransitionError();
    rule.status = "APPROVED";
    rule.approval_reference = input.approvalReference;
    rule.approved_by = input.actorStaffId;
    rule.approved_at = input.approvedAt;
    rule.effective_from = input.effectiveFrom;
    return this.toResponse(rule.id);
  }

  public async activate(
    client: TransactionClient,
    input: Parameters<ProgramStatusRepository["activate"]>[1],
  ): Promise<ProgramRuleVersionResponse> {
    void client;
    if (!this.clinicalOwnerIds.has(input.actorStaffId)) throw new ProgramRuleNotFoundError();
    const rule = this.requireRule(input.ruleId);
    if (rule.status !== "APPROVED") throw new ProgramRuleTransitionError();
    if (rule.effective_from === null || rule.effective_from > input.effectiveDate) {
      throw new ProgramRuleEffectiveDateError();
    }
    for (const other of this.rules) {
      if (other.status === "ACTIVE" && other.id !== rule.id) other.status = "ARCHIVED";
    }
    rule.status = "ACTIVE";
    rule.activated_at = input.activatedAt;
    return this.toResponse(rule.id);
  }

  public async findById(
    client: ProgramStatusQueryRunner,
    ruleId: string,
  ): Promise<ProgramRuleVersionResponse | null> {
    void client;
    return this.rules.some((rule) => rule.id === ruleId) ? this.toResponse(ruleId) : null;
  }

  public async findActiveRule(
    client: ProgramStatusQueryRunner,
  ): Promise<ProgramRuleVersionResponse | null> {
    void client;
    const active = this.rules.find((rule) => rule.status === "ACTIVE");
    return active === undefined ? null : this.toResponse(active.id);
  }

  public async findPregnancyScope(pregnancyId: string): Promise<PregnancyScope | null> {
    return this.pregnancies.get(pregnancyId) ?? null;
  }

  public async findPregnancyIdByMilestone(milestoneId: string): Promise<string | null> {
    return this.milestonePregnancies.get(milestoneId) ?? null;
  }

  public async collectEvidence(
    client: ProgramStatusQueryRunner,
    pregnancyId: string,
  ): Promise<ProgramEvidenceSnapshot> {
    void client;
    return (
      this.evidenceByPregnancy.get(pregnancyId) ?? {
        validatedMilestones: [],
        recordFields: new Map(),
      }
    );
  }

  public async latestAssessment(
    client: ProgramStatusQueryRunner,
    pregnancyId: string,
  ): Promise<ProgramAssessmentEntry | null> {
    void client;
    for (let index = this.assessments.length - 1; index >= 0; index -= 1) {
      const assessment = this.assessments[index];
      if (assessment !== undefined && assessment.pregnancy_id === pregnancyId) return assessment;
    }
    return null;
  }

  public async listAssessments(pregnancyId: string): Promise<ProgramAssessmentEntry[]> {
    return this.assessments
      .filter((assessment) => assessment.pregnancy_id === pregnancyId)
      .slice()
      .reverse();
  }

  public async findAssessmentById(
    client: ProgramStatusQueryRunner,
    assessmentId: string,
  ): Promise<ProgramAssessmentEntry | null> {
    void client;
    return this.assessments.find((assessment) => assessment.id === assessmentId) ?? null;
  }

  public async saveAssessment(
    client: TransactionClient,
    input: Parameters<ProgramStatusRepository["saveAssessment"]>[1],
  ): Promise<void> {
    void client;
    this.assessments.push({
      id: input.assessmentId,
      pregnancy_id: input.pregnancyId,
      rule_version_id: input.ruleVersionId,
      rule_version_no: this.requireRule(input.ruleVersionId).version_no,
      sigizi_kesga_recording_status: input.sigiziKesgaRecordingStatus,
      fetal_rights_status: input.fetalRightsStatus,
      evidence: input.evidence,
      evaluated_at: input.evaluatedAt.toISOString(),
      evaluated_by_type: input.evaluatedByType,
      evaluated_by_staff_id: input.evaluatedByStaffId,
    });
  }

  public async withTransaction<T>(work: (client: TransactionClient) => Promise<T>): Promise<T> {
    return work({} as TransactionClient);
  }

  private requireRule(ruleId: string): FakeRuleVersion {
    const rule = this.rules.find((candidate) => candidate.id === ruleId);
    if (rule === undefined) throw new ProgramRuleNotFoundError();
    return rule;
  }

  private toResponse(ruleId: string): ProgramRuleVersionResponse {
    const rule = this.requireRule(ruleId);
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
      requirements: rule.requirements.map((requirement) => ({
        id: requirement.id,
        program_rule_version_id: rule.id,
        requirement_type: requirement.requirement_type,
        milestone_code: requirement.milestone_code,
        field_key: requirement.field_key ?? null,
      })),
    };
  }
}
