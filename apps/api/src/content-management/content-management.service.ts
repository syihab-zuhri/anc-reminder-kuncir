import { randomUUID } from "node:crypto";
import { HttpStatus, Inject, Injectable } from "@nestjs/common";
import {
  extractContentPlaceholderKeys,
  type ContentTemplateCreateRequest,
  type ContentTemplateListResponse,
  type ContentTemplateResponse,
  type ContentVersionApproveRequest,
  type ContentVersionArchiveRequest,
  type ContentVersionCreateRequest,
  type ContentVersionPublishRequest,
  type ContentVersionResponse,
  type ContentVersionSubmitRequest,
} from "@anc/contracts";
import type { TransactionClient } from "@anc/database";

import type { AuditService } from "../audit/audit.service.js";
import type { Clock } from "../auth/staff-auth.service.js";
import type { StaffActor } from "../auth/staff-auth.types.js";
import { AuthorizationPolicy, forbidden } from "../authorization/authorization.policy.js";
import { ApiException } from "../errors/api.exception.js";
import { IdempotencyService } from "../idempotency/idempotency.service.js";
import {
  AUDIT_SERVICE,
  CLOCK,
  CONTENT_MANAGEMENT_REPOSITORY,
  IDEMPOTENCY_SERVICE,
} from "../infrastructure/tokens.js";
import {
  ContentTemplateConflictError,
  ContentVersionNotFoundError,
  ContentVersionTransitionError,
  type ContentManagementRepository,
} from "./content-management.repository.js";

@Injectable()
export class ContentManagementService {
  public constructor(
    @Inject(CONTENT_MANAGEMENT_REPOSITORY)
    private readonly repository: ContentManagementRepository,
    @Inject(AUDIT_SERVICE) private readonly audit: AuditService,
    @Inject(IDEMPOTENCY_SERVICE) private readonly idempotency: IdempotencyService,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly policy: AuthorizationPolicy,
  ) {}

  public async list(actor: StaffActor): Promise<ContentTemplateListResponse> {
    const healthCenterId = this.assertContentManager(actor);
    const [items, canGovern] = await Promise.all([
      this.repository.listTemplates(healthCenterId),
      this.repository.isClinicalProgramOwner(actor.staffUserId),
    ]);
    return {
      items,
      total: items.length,
      capabilities: {
        can_draft_and_review: true,
        can_approve_publish_archive: canGovern,
      },
    };
  }

  public async get(actor: StaffActor, templateId: string): Promise<ContentTemplateResponse> {
    const healthCenterId = this.assertContentManager(actor);
    const template = await this.repository.findTemplateById(
      this.repository.queryRunner(),
      templateId,
      healthCenterId,
    );
    if (template === null) throw notFound();
    return template;
  }

  public async createTemplate(
    actor: StaffActor,
    input: ContentTemplateCreateRequest,
  ): Promise<ContentTemplateResponse> {
    const healthCenterId = this.assertContentManager(actor);
    try {
      const outcome = await this.idempotency.runForStaff(
        {
          actor,
          operation: "CONTENT_TEMPLATE_CREATE",
          idempotencyKey: input.idempotency_key,
          requestIdentity: input,
        },
        async (client) => {
          const templateId = randomUUID();
          const template = await this.repository.createTemplate(client, {
            templateId,
            versionId: randomUUID(),
            healthCenterId,
            actorStaffId: actor.staffUserId,
            placeholderKeys: extractContentPlaceholderKeys(input.body),
            request: input,
          });
          return { resourceType: "CONTENT_TEMPLATE", resourceId: templateId, value: template };
        },
        (client, resource) => this.replayTemplate(client, healthCenterId, resource),
      );
      if (!outcome.replayed) {
        await this.recordAudit(
          actor,
          "CONTENT_TEMPLATE_DRAFT_CREATED",
          "CONTENT_TEMPLATE",
          outcome.value.id,
          {
            content_type: outcome.value.content_type,
            version_no: 1,
          },
        );
      }
      return outcome.value;
    } catch (error) {
      throw mapContentError(error);
    }
  }

  public async createVersion(
    actor: StaffActor,
    templateId: string,
    input: ContentVersionCreateRequest,
  ): Promise<ContentVersionResponse> {
    const healthCenterId = this.assertContentManager(actor);
    try {
      const outcome = await this.idempotency.runForStaff(
        {
          actor,
          operation: "CONTENT_VERSION_CREATE",
          idempotencyKey: input.idempotency_key,
          requestIdentity: { template_id: templateId, ...input },
        },
        async (client) => {
          const versionId = randomUUID();
          const version = await this.repository.createVersion(client, {
            versionId,
            templateId,
            healthCenterId,
            actorStaffId: actor.staffUserId,
            placeholderKeys: extractContentPlaceholderKeys(input.body),
            request: input,
          });
          return { resourceType: "CONTENT_VERSION", resourceId: versionId, value: version };
        },
        (client, resource) => this.replayVersion(client, healthCenterId, resource),
      );
      if (!outcome.replayed) {
        await this.recordVersionAudit(actor, "CONTENT_VERSION_DRAFT_CREATED", outcome.value);
      }
      return outcome.value;
    } catch (error) {
      throw mapContentError(error);
    }
  }

  public submitReview(
    actor: StaffActor,
    versionId: string,
    input: ContentVersionSubmitRequest,
  ): Promise<ContentVersionResponse> {
    const healthCenterId = this.assertContentManager(actor);
    return this.transition(
      actor,
      versionId,
      input,
      "CONTENT_VERSION_SUBMIT_REVIEW",
      "CONTENT_VERSION_SUBMITTED_REVIEW",
      (client) =>
        this.repository.submitReview(
          client,
          versionId,
          healthCenterId,
          actor.staffUserId,
          this.clock(),
        ),
    );
  }

  public async approve(
    actor: StaffActor,
    versionId: string,
    input: ContentVersionApproveRequest,
  ): Promise<ContentVersionResponse> {
    const healthCenterId = await this.assertGovernor(actor);
    return this.transition(
      actor,
      versionId,
      input,
      "CONTENT_VERSION_APPROVE",
      "CONTENT_VERSION_APPROVED",
      (client) =>
        this.repository.approve(
          client,
          versionId,
          healthCenterId,
          actor.staffUserId,
          input.approval_reference,
          this.clock(),
        ),
      { approval_reference: input.approval_reference },
    );
  }

  public async publish(
    actor: StaffActor,
    versionId: string,
    input: ContentVersionPublishRequest,
  ): Promise<ContentVersionResponse> {
    const healthCenterId = await this.assertGovernor(actor);
    return this.transition(
      actor,
      versionId,
      input,
      "CONTENT_VERSION_PUBLISH",
      "CONTENT_VERSION_PUBLISHED",
      (client) =>
        this.repository.publish(client, versionId, healthCenterId, actor.staffUserId, this.clock()),
    );
  }

  public async archive(
    actor: StaffActor,
    versionId: string,
    input: ContentVersionArchiveRequest,
  ): Promise<ContentVersionResponse> {
    const healthCenterId = await this.assertGovernor(actor);
    return this.transition(
      actor,
      versionId,
      input,
      "CONTENT_VERSION_ARCHIVE",
      "CONTENT_VERSION_ARCHIVED",
      (client) =>
        this.repository.archive(client, versionId, healthCenterId, actor.staffUserId, this.clock()),
    );
  }

  private async transition<T extends { readonly idempotency_key: string }>(
    actor: StaffActor,
    versionId: string,
    input: T,
    operation: string,
    auditAction: string,
    execute: (client: TransactionClient) => Promise<ContentVersionResponse>,
    metadata: Readonly<Record<string, string | number | boolean | null>> = {},
  ): Promise<ContentVersionResponse> {
    if (actor.healthCenterId === null) throw forbidden();
    try {
      const outcome = await this.idempotency.runForStaff(
        {
          actor,
          operation,
          idempotencyKey: input.idempotency_key,
          requestIdentity: { version_id: versionId, ...input },
        },
        async (client) => {
          const version = await execute(client);
          return { resourceType: "CONTENT_VERSION", resourceId: versionId, value: version };
        },
        (client, resource) => this.replayVersion(client, actor.healthCenterId!, resource),
      );
      if (!outcome.replayed) {
        await this.recordVersionAudit(actor, auditAction, outcome.value, metadata);
      }
      return outcome.value;
    } catch (error) {
      throw mapContentError(error);
    }
  }

  private assertContentManager(actor: StaffActor): string {
    this.policy.assertCapability(actor, "CONTENT_MANAGE");
    if (actor.role !== "PUSKESMAS" || actor.healthCenterId === null) throw forbidden();
    return actor.healthCenterId;
  }

  private async assertGovernor(actor: StaffActor): Promise<string> {
    const healthCenterId = this.assertContentManager(actor);
    if (!(await this.repository.isClinicalProgramOwner(actor.staffUserId))) throw forbidden();
    return healthCenterId;
  }

  private async replayTemplate(
    client: Parameters<ContentManagementRepository["findTemplateById"]>[0],
    healthCenterId: string,
    resource: { readonly resourceType: string; readonly resourceId: string },
  ): Promise<ContentTemplateResponse> {
    if (resource.resourceType !== "CONTENT_TEMPLATE") throw new Error("Invalid replay resource");
    const template = await this.repository.findTemplateById(
      client,
      resource.resourceId,
      healthCenterId,
    );
    if (template === null) throw new Error("Content template replay resource is missing");
    return template;
  }

  private async replayVersion(
    client: Parameters<ContentManagementRepository["findVersionById"]>[0],
    healthCenterId: string,
    resource: { readonly resourceType: string; readonly resourceId: string },
  ): Promise<ContentVersionResponse> {
    if (resource.resourceType !== "CONTENT_VERSION") throw new Error("Invalid replay resource");
    const version = await this.repository.findVersionById(
      client,
      resource.resourceId,
      healthCenterId,
    );
    if (version === null) throw new Error("Content version replay resource is missing");
    return version;
  }

  private recordVersionAudit(
    actor: StaffActor,
    action: string,
    version: ContentVersionResponse,
    metadata: Readonly<Record<string, string | number | boolean | null>> = {},
  ): Promise<void> {
    return this.recordAudit(actor, action, "CONTENT_VERSION", version.id, {
      version_no: version.version_no,
      template_id: version.content_template_id,
      ...metadata,
    });
  }

  private recordAudit(
    actor: StaffActor,
    action: string,
    resourceType: string,
    resourceId: string,
    metadata: Readonly<Record<string, string | number | boolean | null>>,
  ): Promise<void> {
    return this.audit.record({
      actorType: "STAFF",
      actorId: actor.staffUserId,
      action,
      resourceType,
      resourceId,
      metadata,
    });
  }
}

function mapContentError(error: unknown): unknown {
  if (error instanceof ContentVersionNotFoundError) return notFound();
  if (error instanceof ContentTemplateConflictError) {
    return new ApiException({
      status: HttpStatus.CONFLICT,
      code: "CONTENT_VERSION_CONFLICT",
      message: "Template atau versi konten aktif untuk jenis ini sudah tersedia.",
    });
  }
  if (error instanceof ContentVersionTransitionError) {
    return new ApiException({
      status: HttpStatus.CONFLICT,
      code: "CONTENT_INVALID_TRANSITION",
      message: "Status konten tidak mengizinkan perubahan lifecycle ini.",
    });
  }
  if (isDatabaseError(error, "23514")) {
    return new ApiException({
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      code: "CONTENT_POLICY_VIOLATION",
      message: "Konten melanggar aturan sanitasi, placeholder, atau immutability.",
    });
  }
  if (isDatabaseError(error, "23505")) return mapContentError(new ContentTemplateConflictError());
  return error;
}

function notFound(): ApiException {
  return new ApiException({
    status: HttpStatus.NOT_FOUND,
    code: "CONTENT_NOT_FOUND",
    message: "Template atau versi konten tidak ditemukan.",
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
