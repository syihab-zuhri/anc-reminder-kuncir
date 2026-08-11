import { randomUUID } from "node:crypto";
import { HttpStatus, Inject, Injectable } from "@nestjs/common";
import type { ApiConfig } from "@anc/config";
import type {
  AncPlanActivateRequest,
  AncPlanApproveRequest,
  AncPlanCreateRequest,
  AncPlanResponse,
  PregnancyMilestoneListResponse,
  PregnancyNextMilestoneResponse,
} from "@anc/contracts";

import type { AuditService } from "../audit/audit.service.js";
import type { Clock } from "../auth/staff-auth.service.js";
import type { StaffActor } from "../auth/staff-auth.types.js";
import { AuthorizationPolicy } from "../authorization/authorization.policy.js";
import { ScopedAccessService } from "../authorization/scoped-access.service.js";
import { ApiException } from "../errors/api.exception.js";
import { IdempotencyService } from "../idempotency/idempotency.service.js";
import {
  ANC_PLAN_REPOSITORY,
  API_CONFIG,
  AUDIT_SERVICE,
  CLOCK,
  IDEMPOTENCY_SERVICE,
} from "../infrastructure/tokens.js";
import {
  AncPlanEffectiveDateError,
  AncPlanNotFoundError,
  AncPlanTransitionError,
  type AncPlanRepository,
} from "./anc-plan.repository.js";
import {
  derivePregnancyMilestoneState,
  InvalidPregnancyDatingStateError,
  UnsupportedPregnancyDatingBasisError,
} from "./anc-derived-state.js";
import { dateOnlyInTimezone } from "../registry/registry-validation.js";

@Injectable()
export class AncPlanService {
  public constructor(
    @Inject(ANC_PLAN_REPOSITORY) private readonly repository: AncPlanRepository,
    @Inject(AUDIT_SERVICE) private readonly audit: AuditService,
    @Inject(IDEMPOTENCY_SERVICE) private readonly idempotency: IdempotencyService,
    @Inject(API_CONFIG) private readonly config: ApiConfig,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly policy: AuthorizationPolicy,
    private readonly scopedAccess: ScopedAccessService,
  ) {}

  public async active(actor: StaffActor): Promise<AncPlanResponse> {
    this.policy.assertCapability(actor, "STAFF_SELF_READ");
    const plan = await this.repository.findAssignable();
    if (plan === null) {
      throw new ApiException({
        status: HttpStatus.NOT_FOUND,
        code: "ANC_PLAN_NOT_AVAILABLE",
        message: "Rencana ANC yang dapat digunakan belum tersedia.",
      });
    }
    return plan;
  }

  public async createDraft(
    actor: StaffActor,
    input: AncPlanCreateRequest,
  ): Promise<AncPlanResponse> {
    this.policy.assertCapability(actor, "CARE_PLAN_MANAGE");
    const outcome = await this.idempotency.runForStaff(
      {
        actor,
        operation: "ANC_PLAN_CREATE",
        idempotencyKey: input.idempotency_key,
        requestIdentity: input,
      },
      async (client) => {
        const planId = randomUUID();
        const plan = await this.repository.createDraft(client, {
          planId,
          actorStaffId: actor.staffUserId,
          sourceReference: input.source_reference,
          rules: input.rules.map((rule) => ({ ...rule, id: randomUUID() })),
        });
        return { resourceType: "ANC_PLAN_VERSION", resourceId: planId, value: plan };
      },
      (client, resource) => this.replayPlan(client, resource.resourceType, resource.resourceId),
    );
    if (!outcome.replayed) {
      await this.recordAudit(actor, "ANC_PLAN_DRAFT_CREATED", outcome.value);
    }
    return outcome.value;
  }

  public async approve(
    actor: StaffActor,
    planId: string,
    input: AncPlanApproveRequest,
  ): Promise<AncPlanResponse> {
    await this.assertPlanGovernor(actor);
    const now = this.clock();
    try {
      const outcome = await this.idempotency.runForStaff(
        {
          actor,
          operation: "ANC_PLAN_APPROVE",
          idempotencyKey: input.idempotency_key,
          requestIdentity: { plan_id: planId, ...input },
        },
        async (client) => {
          const plan = await this.repository.approve(client, {
            planId,
            actorStaffId: actor.staffUserId,
            approvalReference: input.approval_reference,
            effectiveFrom: input.effective_from,
            approvedAt: now,
          });
          return { resourceType: "ANC_PLAN_VERSION", resourceId: planId, value: plan };
        },
        (client, resource) => this.replayPlan(client, resource.resourceType, resource.resourceId),
      );
      if (!outcome.replayed) {
        await this.recordAudit(actor, "ANC_PLAN_APPROVED", outcome.value, {
          approval_reference: input.approval_reference,
        });
      }
      return outcome.value;
    } catch (error) {
      throw mapPlanError(error);
    }
  }

  public async activate(
    actor: StaffActor,
    planId: string,
    input: AncPlanActivateRequest,
  ): Promise<AncPlanResponse> {
    await this.assertPlanGovernor(actor);
    const now = this.clock();
    try {
      const outcome = await this.idempotency.runForStaff(
        {
          actor,
          operation: "ANC_PLAN_ACTIVATE",
          idempotencyKey: input.idempotency_key,
          requestIdentity: { plan_id: planId, ...input },
        },
        async (client) => {
          const plan = await this.repository.activate(client, {
            planId,
            actorStaffId: actor.staffUserId,
            effectiveDate: dateOnlyInTimezone(now, this.config.primaryTimezone),
            activatedAt: now,
          });
          return { resourceType: "ANC_PLAN_VERSION", resourceId: planId, value: plan };
        },
        (client, resource) => this.replayPlan(client, resource.resourceType, resource.resourceId),
      );
      if (!outcome.replayed) {
        await this.recordAudit(actor, "ANC_PLAN_ACTIVATED", outcome.value);
      }
      return outcome.value;
    } catch (error) {
      throw mapPlanError(error);
    }
  }

  public async milestones(
    actor: StaffActor,
    pregnancyId: string,
  ): Promise<PregnancyMilestoneListResponse> {
    const motherId = await this.repository.findPregnancyMotherId(pregnancyId);
    if (motherId === null) throw planTargetForbidden();
    await this.scopedAccess.assertMotherRead(actor, motherId);
    const snapshot = await this.repository.listPregnancyMilestones(pregnancyId);
    if (snapshot === null || snapshot.milestones.length !== 8) {
      throw new ApiException({
        status: HttpStatus.CONFLICT,
        code: "PREGNANCY_MILESTONES_NOT_READY",
        message: "Milestone kehamilan belum lengkap.",
      });
    }
    try {
      return derivePregnancyMilestoneState(snapshot, this.clock(), this.config.primaryTimezone);
    } catch (error) {
      if (error instanceof InvalidPregnancyDatingStateError) {
        throw new ApiException({
          status: HttpStatus.CONFLICT,
          code: "PREGNANCY_DATING_INVALID",
          message: "Data awal kehamilan belum dapat digunakan untuk kalkulasi.",
        });
      }
      if (error instanceof UnsupportedPregnancyDatingBasisError) {
        throw new ApiException({
          status: HttpStatus.CONFLICT,
          code: "PREGNANCY_DATING_BASIS_UNSUPPORTED",
          message: "Dasar perhitungan usia kehamilan belum didukung.",
        });
      }
      throw error;
    }
  }

  public async nextMilestone(
    actor: StaffActor,
    pregnancyId: string,
  ): Promise<PregnancyNextMilestoneResponse> {
    const timeline = await this.milestones(actor, pregnancyId);
    return {
      pregnancy_id: timeline.pregnancy_id,
      as_of_date: timeline.as_of_date,
      gestational_age: timeline.gestational_age,
      trimester_label: timeline.trimester_label,
      next_milestone:
        timeline.milestones.find((milestone) => milestone.code === timeline.next_milestone_code) ??
        null,
    };
  }

  private async replayPlan(
    client: Parameters<AncPlanRepository["findById"]>[0],
    resourceType: string,
    resourceId: string,
  ): Promise<AncPlanResponse> {
    if (resourceType !== "ANC_PLAN_VERSION") {
      throw new Error("Unexpected ANC plan idempotency resource type");
    }
    const plan = await this.repository.findById(client, resourceId);
    if (plan === null) throw new Error("ANC plan replay resource is missing");
    return plan;
  }

  private async assertPlanGovernor(actor: StaffActor): Promise<void> {
    this.policy.assertCapability(actor, "CARE_PLAN_MANAGE");
    if (!(await this.repository.isClinicalProgramOwner(actor.staffUserId))) {
      throw planTargetForbidden();
    }
  }

  private async recordAudit(
    actor: StaffActor,
    action: string,
    plan: AncPlanResponse,
    metadata: Readonly<Record<string, unknown>> = {},
  ): Promise<void> {
    await this.audit.record({
      actorType: "STAFF",
      actorId: actor.staffUserId,
      action,
      resourceType: "ANC_PLAN_VERSION",
      resourceId: plan.id,
      metadata: { version_no: plan.version_no, ...metadata },
    });
  }
}

function mapPlanError(error: unknown): unknown {
  if (error instanceof AncPlanNotFoundError) return planTargetForbidden();
  if (error instanceof AncPlanTransitionError) {
    return new ApiException({
      status: HttpStatus.CONFLICT,
      code: "ANC_PLAN_INVALID_TRANSITION",
      message: "Status rencana ANC tidak mengizinkan tindakan ini.",
    });
  }
  if (error instanceof AncPlanEffectiveDateError) {
    return new ApiException({
      status: HttpStatus.CONFLICT,
      code: "ANC_PLAN_NOT_EFFECTIVE",
      message: "Tanggal efektif rencana ANC belum tercapai.",
    });
  }
  if (isDatabaseError(error, "23514")) {
    return new ApiException({
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      code: "ANC_PLAN_RULES_INCOMPLETE",
      message: "Rencana ANC belum memiliki konfigurasi K1-K8 yang lengkap dan valid.",
    });
  }
  return error;
}

function planTargetForbidden(): ApiException {
  return new ApiException({
    status: HttpStatus.FORBIDDEN,
    code: "FORBIDDEN",
    message: "Anda tidak memiliki akses untuk tindakan ini.",
  });
}

function isDatabaseError(error: unknown, code: string): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { readonly code?: unknown }).code === code
  );
}
