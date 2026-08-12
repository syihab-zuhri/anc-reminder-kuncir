import { randomUUID } from "node:crypto";
import { HttpStatus, Inject, Injectable } from "@nestjs/common";
import type { ApiConfig } from "@anc/config";
import type {
  ProgramAssessmentEntry,
  ProgramAssessmentRecalculateRequest,
  ProgramRuleRequirementInput,
  ProgramRuleVersionActivateRequest,
  ProgramRuleVersionApproveRequest,
  ProgramRuleVersionCreateRequest,
  ProgramRuleVersionResponse,
  ProgramStatusHistoryResponse,
  ProgramStatusResponse,
} from "@anc/contracts";

import type { AuditService } from "../audit/audit.service.js";
import type { Clock } from "../auth/staff-auth.service.js";
import type { StaffActor } from "../auth/staff-auth.types.js";
import { AuthorizationPolicy, forbidden } from "../authorization/authorization.policy.js";
import { ScopedAccessService } from "../authorization/scoped-access.service.js";
import { ApiException } from "../errors/api.exception.js";
import { IdempotencyService } from "../idempotency/idempotency.service.js";
import {
  API_CONFIG,
  AUDIT_SERVICE,
  CLOCK,
  IDEMPOTENCY_SERVICE,
  PROGRAM_STATUS_REPOSITORY,
} from "../infrastructure/tokens.js";
import { evaluateProgramEvidence } from "./program-status.evaluator.js";
import {
  ProgramRuleEffectiveDateError,
  ProgramRuleNotFoundError,
  ProgramRuleTransitionError,
  type ProgramStatusRepository,
} from "./program-status.repository.js";
import { dateOnlyInTimezone } from "../registry/registry-validation.js";

const NO_ACTIVE_RULE_NOTICE =
  "Status program belum dinilai karena rule kelengkapan yang disetujui belum aktif.";

@Injectable()
export class ProgramStatusService {
  public constructor(
    @Inject(PROGRAM_STATUS_REPOSITORY) private readonly repository: ProgramStatusRepository,
    @Inject(AUDIT_SERVICE) private readonly audit: AuditService,
    @Inject(IDEMPOTENCY_SERVICE) private readonly idempotency: IdempotencyService,
    @Inject(API_CONFIG) private readonly config: ApiConfig,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly policy: AuthorizationPolicy,
    private readonly scopedAccess: ScopedAccessService,
  ) {}

  public async activeRule(actor: StaffActor): Promise<ProgramRuleVersionResponse> {
    this.policy.assertCapability(actor, "STAFF_SELF_READ");
    const rule = await this.repository.findActiveRule(this.repository.queryRunner());
    if (rule === null) {
      throw new ApiException({
        status: HttpStatus.NOT_FOUND,
        code: "PROGRAM_RULE_NOT_AVAILABLE",
        message: "Rule program yang aktif belum tersedia.",
      });
    }
    return rule;
  }

  public async createDraft(
    actor: StaffActor,
    input: ProgramRuleVersionCreateRequest,
  ): Promise<ProgramRuleVersionResponse> {
    await this.assertRuleGovernor(actor);
    const outcome = await this.idempotency.runForStaff(
      {
        actor,
        operation: "PROGRAM_RULE_CREATE",
        idempotencyKey: input.idempotency_key,
        requestIdentity: input,
      },
      async (client) => {
        const ruleId = randomUUID();
        const rule = await this.repository.createDraft(client, {
          ruleId,
          actorStaffId: actor.staffUserId,
          sourceReference: input.source_reference,
          requirements: input.requirements.map((requirement) => ({
            ...requirement,
            id: randomUUID(),
          })),
        });
        return { resourceType: "PROGRAM_RULE_VERSION", resourceId: ruleId, value: rule };
      },
      (client, resource) => this.replayRule(client, resource.resourceType, resource.resourceId),
    );
    if (!outcome.replayed) {
      await this.recordRuleAudit(actor, "PROGRAM_RULE_DRAFT_CREATED", outcome.value);
    }
    return outcome.value;
  }

  public async approve(
    actor: StaffActor,
    ruleId: string,
    input: ProgramRuleVersionApproveRequest,
  ): Promise<ProgramRuleVersionResponse> {
    await this.assertRuleGovernor(actor);
    const now = this.clock();
    try {
      const outcome = await this.idempotency.runForStaff(
        {
          actor,
          operation: "PROGRAM_RULE_APPROVE",
          idempotencyKey: input.idempotency_key,
          requestIdentity: { rule_id: ruleId, ...input },
        },
        async (client) => {
          const rule = await this.repository.approve(client, {
            ruleId,
            actorStaffId: actor.staffUserId,
            approvalReference: input.approval_reference,
            effectiveFrom: input.effective_from,
            approvedAt: now,
          });
          return { resourceType: "PROGRAM_RULE_VERSION", resourceId: ruleId, value: rule };
        },
        (client, resource) => this.replayRule(client, resource.resourceType, resource.resourceId),
      );
      if (!outcome.replayed) {
        await this.recordRuleAudit(actor, "PROGRAM_RULE_APPROVED", outcome.value, {
          approval_reference: input.approval_reference,
        });
      }
      return outcome.value;
    } catch (error) {
      throw mapRuleError(error);
    }
  }

  public async activate(
    actor: StaffActor,
    ruleId: string,
    input: ProgramRuleVersionActivateRequest,
  ): Promise<ProgramRuleVersionResponse> {
    await this.assertRuleGovernor(actor);
    const now = this.clock();
    try {
      const outcome = await this.idempotency.runForStaff(
        {
          actor,
          operation: "PROGRAM_RULE_ACTIVATE",
          idempotencyKey: input.idempotency_key,
          requestIdentity: { rule_id: ruleId, ...input },
        },
        async (client) => {
          const rule = await this.repository.activate(client, {
            ruleId,
            actorStaffId: actor.staffUserId,
            effectiveDate: dateOnlyInTimezone(now, this.config.primaryTimezone),
            activatedAt: now,
          });
          return { resourceType: "PROGRAM_RULE_VERSION", resourceId: ruleId, value: rule };
        },
        (client, resource) => this.replayRule(client, resource.resourceType, resource.resourceId),
      );
      if (!outcome.replayed) {
        await this.recordRuleAudit(actor, "PROGRAM_RULE_ACTIVATED", outcome.value);
      }
      return outcome.value;
    } catch (error) {
      throw mapRuleError(error);
    }
  }

  public async getStatus(actor: StaffActor, pregnancyId: string): Promise<ProgramStatusResponse> {
    await this.assertPregnancyRead(actor, pregnancyId);
    const rule = await this.repository.findActiveRule(this.repository.queryRunner());
    if (rule === null) {
      return notEvaluated(pregnancyId);
    }
    const snapshot = await this.repository.collectEvidence(
      this.repository.queryRunner(),
      pregnancyId,
    );
    const evaluation = evaluateProgramEvidence(toRequirementInputs(rule), snapshot);
    return {
      pregnancy_id: pregnancyId,
      rule_version_id: rule.id,
      rule_version_no: rule.version_no,
      rule_status: rule.status,
      sigizi_kesga_recording_status: evaluation.complete ? "COMPLETE" : "IN_PROGRESS",
      fetal_rights_status: evaluation.complete ? "MET" : "NOT_YET_MET",
      evidence: evaluation.evidence,
      evaluated_at: this.clock().toISOString(),
      evaluated_by_type: null,
      evaluated_by_staff_id: null,
      stored: false,
      notice: null,
    };
  }

  public async recalculate(
    actor: StaffActor,
    pregnancyId: string,
    input: ProgramAssessmentRecalculateRequest,
  ): Promise<ProgramStatusResponse> {
    this.policy.assertCapability(actor, "PROGRAM_STATUS_MANAGE");
    await this.assertPregnancyCenterScope(actor, pregnancyId);
    const now = this.clock();
    const outcome = await this.idempotency.runForStaff(
      {
        actor,
        operation: "PROGRAM_ASSESSMENT_RECALCULATE",
        idempotencyKey: input.idempotency_key,
        requestIdentity: { pregnancy_id: pregnancyId, ...input },
      },
      async (client) => {
        const rule = await this.repository.findActiveRule(client);
        if (rule === null) throw programRuleNotActive();
        const previous = await this.repository.latestAssessment(client, pregnancyId);
        const snapshot = await this.repository.collectEvidence(client, pregnancyId);
        const evaluation = evaluateProgramEvidence(toRequirementInputs(rule), snapshot);
        const assessmentId = randomUUID();
        await this.repository.saveAssessment(client, {
          assessmentId,
          pregnancyId,
          ruleVersionId: rule.id,
          sigiziKesgaRecordingStatus: evaluation.complete ? "COMPLETE" : "IN_PROGRESS",
          fetalRightsStatus: evaluation.complete ? "MET" : "NOT_YET_MET",
          evidence: evaluation.evidence,
          evaluatedAt: now,
          evaluatedByType: "STAFF",
          evaluatedByStaffId: actor.staffUserId,
        });
        const assessment = await this.repository.findAssessmentById(client, assessmentId);
        if (assessment === null) throw new Error("Program assessment disappeared after insert");
        return {
          resourceType: "PROGRAM_ASSESSMENT",
          resourceId: assessmentId,
          value: { assessment, previous, ruleVersionNo: rule.version_no },
        };
      },
      async (client, resource) => {
        if (resource.resourceType !== "PROGRAM_ASSESSMENT") {
          throw new Error("Unexpected program assessment idempotency resource type");
        }
        const assessment = await this.repository.findAssessmentById(client, resource.resourceId);
        if (assessment === null) throw new Error("Program assessment replay resource is missing");
        return { assessment, previous: null, ruleVersionNo: assessment.rule_version_no };
      },
    );
    if (!outcome.replayed) {
      await this.recordAssessmentAudit(
        { actorType: "STAFF", actorId: actor.staffUserId },
        outcome.value.assessment,
        outcome.value.previous,
        outcome.value.ruleVersionNo,
        input.reason ?? null,
      );
    }
    return toStoredResponse(pregnancyId, outcome.value.assessment);
  }

  public async history(
    actor: StaffActor,
    pregnancyId: string,
  ): Promise<ProgramStatusHistoryResponse> {
    this.policy.assertCapability(actor, "PROGRAM_STATUS_MANAGE");
    await this.assertPregnancyCenterScope(actor, pregnancyId);
    return {
      pregnancy_id: pregnancyId,
      assessments: await this.repository.listAssessments(pregnancyId),
    };
  }

  // Runs after K1-K6 evidence changes; stores a SYSTEM assessment only when an
  // approved rule is active, so it stays a no-op before clinical approval.
  public async evaluateSystemForMilestone(milestoneId: string): Promise<void> {
    const pregnancyId = await this.repository.findPregnancyIdByMilestone(milestoneId);
    if (pregnancyId === null) return;
    const now = this.clock();
    const result = await this.repository.withTransaction(async (client) => {
      const rule = await this.repository.findActiveRule(client);
      if (rule === null) return null;
      const previous = await this.repository.latestAssessment(client, pregnancyId);
      const snapshot = await this.repository.collectEvidence(client, pregnancyId);
      const evaluation = evaluateProgramEvidence(toRequirementInputs(rule), snapshot);
      const assessmentId = randomUUID();
      await this.repository.saveAssessment(client, {
        assessmentId,
        pregnancyId,
        ruleVersionId: rule.id,
        sigiziKesgaRecordingStatus: evaluation.complete ? "COMPLETE" : "IN_PROGRESS",
        fetalRightsStatus: evaluation.complete ? "MET" : "NOT_YET_MET",
        evidence: evaluation.evidence,
        evaluatedAt: now,
        evaluatedByType: "SYSTEM",
        evaluatedByStaffId: null,
      });
      const assessment = await this.repository.findAssessmentById(client, assessmentId);
      if (assessment === null) throw new Error("Program assessment disappeared after insert");
      return { assessment, previous, ruleVersionNo: rule.version_no };
    });
    if (result === null) return;
    await this.recordAssessmentAudit(
      { actorType: "SYSTEM" },
      result.assessment,
      result.previous,
      result.ruleVersionNo,
      null,
    );
  }

  private async replayRule(
    client: Parameters<ProgramStatusRepository["findById"]>[0],
    resourceType: string,
    resourceId: string,
  ): Promise<ProgramRuleVersionResponse> {
    if (resourceType !== "PROGRAM_RULE_VERSION") {
      throw new Error("Unexpected program rule idempotency resource type");
    }
    const rule = await this.repository.findById(client, resourceId);
    if (rule === null) throw new Error("Program rule replay resource is missing");
    return rule;
  }

  private async assertRuleGovernor(actor: StaffActor): Promise<void> {
    this.policy.assertCapability(actor, "CARE_PLAN_MANAGE");
    if (!(await this.repository.isClinicalProgramOwner(actor.staffUserId))) {
      throw forbidden();
    }
  }

  private async assertPregnancyRead(actor: StaffActor, pregnancyId: string): Promise<void> {
    const scope = await this.repository.findPregnancyScope(pregnancyId);
    if (scope === null) throw forbidden();
    await this.scopedAccess.assertMotherRead(actor, scope.motherId);
  }

  private async assertPregnancyCenterScope(actor: StaffActor, pregnancyId: string): Promise<void> {
    const scope = await this.repository.findPregnancyScope(pregnancyId);
    if (scope === null) throw forbidden();
    this.policy.assertHealthCenterScope(actor, scope.healthCenterId);
  }

  private async recordRuleAudit(
    actor: StaffActor,
    action: string,
    rule: ProgramRuleVersionResponse,
    metadata: Readonly<Record<string, string | number | boolean | null>> = {},
  ): Promise<void> {
    await this.audit.record({
      actorType: "STAFF",
      actorId: actor.staffUserId,
      action,
      resourceType: "PROGRAM_RULE_VERSION",
      resourceId: rule.id,
      metadata: { version_no: rule.version_no, ...metadata },
    });
  }

  private async recordAssessmentAudit(
    actor: { readonly actorType: "STAFF" | "SYSTEM"; readonly actorId?: string },
    assessment: ProgramAssessmentEntry,
    previous: ProgramAssessmentEntry | null,
    ruleVersionNo: number,
    reason: string | null,
  ): Promise<void> {
    await this.audit.record({
      actorType: actor.actorType,
      actorId: actor.actorId ?? null,
      action: "PROGRAM_ASSESSMENT_RECALCULATED",
      resourceType: "PROGRAM_ASSESSMENT",
      resourceId: assessment.id,
      metadata: {
        version_no: ruleVersionNo,
        ...(reason === null ? {} : { reason }),
      },
    });
    const changed =
      previous === null ||
      previous.sigizi_kesga_recording_status !== assessment.sigizi_kesga_recording_status ||
      previous.fetal_rights_status !== assessment.fetal_rights_status;
    if (changed) {
      await this.audit.record({
        actorType: actor.actorType,
        actorId: actor.actorId ?? null,
        action: "PROGRAM_STATUS_CHANGED",
        resourceType: "PROGRAM_ASSESSMENT",
        resourceId: assessment.id,
        metadata: { version_no: ruleVersionNo },
      });
    }
  }
}

function toRequirementInputs(rule: ProgramRuleVersionResponse): ProgramRuleRequirementInput[] {
  return rule.requirements.map((requirement) => ({
    requirement_type: requirement.requirement_type,
    milestone_code: requirement.milestone_code,
    ...(requirement.field_key === null ? {} : { field_key: requirement.field_key }),
  }));
}

function notEvaluated(pregnancyId: string): ProgramStatusResponse {
  return {
    pregnancy_id: pregnancyId,
    rule_version_id: null,
    rule_version_no: null,
    rule_status: null,
    sigizi_kesga_recording_status: "NOT_EVALUATED",
    fetal_rights_status: "NOT_EVALUATED",
    evidence: null,
    evaluated_at: null,
    evaluated_by_type: null,
    evaluated_by_staff_id: null,
    stored: false,
    notice: NO_ACTIVE_RULE_NOTICE,
  };
}

function toStoredResponse(
  pregnancyId: string,
  assessment: ProgramAssessmentEntry,
): ProgramStatusResponse {
  return {
    pregnancy_id: pregnancyId,
    rule_version_id: assessment.rule_version_id,
    rule_version_no: assessment.rule_version_no,
    rule_status: "ACTIVE",
    sigizi_kesga_recording_status: assessment.sigizi_kesga_recording_status,
    fetal_rights_status: assessment.fetal_rights_status,
    evidence: assessment.evidence,
    evaluated_at: assessment.evaluated_at,
    evaluated_by_type: assessment.evaluated_by_type,
    evaluated_by_staff_id: assessment.evaluated_by_staff_id,
    stored: true,
    notice: null,
  };
}

function programRuleNotActive(): ApiException {
  return new ApiException({
    status: HttpStatus.CONFLICT,
    code: "PROGRAM_RULE_NOT_ACTIVE",
    message: "Penilaian program membutuhkan rule kelengkapan yang sudah aktif.",
  });
}

function mapRuleError(error: unknown): unknown {
  if (error instanceof ProgramRuleNotFoundError) return forbidden();
  if (error instanceof ProgramRuleTransitionError) {
    return new ApiException({
      status: HttpStatus.CONFLICT,
      code: "PROGRAM_RULE_INVALID_TRANSITION",
      message: "Status rule program tidak mengizinkan tindakan ini.",
    });
  }
  if (error instanceof ProgramRuleEffectiveDateError) {
    return new ApiException({
      status: HttpStatus.CONFLICT,
      code: "PROGRAM_RULE_NOT_EFFECTIVE",
      message: "Tanggal efektif rule program belum tercapai.",
    });
  }
  if (isDatabaseError(error, "23514")) {
    return new ApiException({
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      code: "PROGRAM_RULE_REQUIREMENTS_INCOMPLETE",
      message: "Rule program belum memiliki requirement yang valid.",
    });
  }
  return error;
}

function isDatabaseError(error: unknown, code: string): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { readonly code?: unknown }).code === code
  );
}
