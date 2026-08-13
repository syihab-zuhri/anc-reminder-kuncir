/* eslint-disable @typescript-eslint/require-await -- in-memory repository satisfies async port */
import type {
  ContentTemplateResponse,
  ContentVersionResponse,
  ContentVersionStatus,
} from "@anc/contracts";
import type { TransactionClient } from "@anc/database";

import {
  ContentTemplateConflictError,
  ContentVersionNotFoundError,
  ContentVersionTransitionError,
  type ContentManagementRepository,
} from "../src/content-management/content-management.repository.js";

export class FakeContentManagementRepository implements ContentManagementRepository {
  public readonly clinicalOwnerIds = new Set<string>();
  private readonly templates: ContentTemplateResponse[] = [];

  public queryRunner() {
    return {} as TransactionClient;
  }

  public async withTransaction<T>(work: (client: TransactionClient) => Promise<T>): Promise<T> {
    return work({} as TransactionClient);
  }

  public async isClinicalProgramOwner(staffUserId: string): Promise<boolean> {
    return this.clinicalOwnerIds.has(staffUserId);
  }

  public async listTemplates(healthCenterId: string): Promise<ContentTemplateResponse[]> {
    return this.templates
      .filter(
        (template) =>
          template.health_center_id === null || template.health_center_id === healthCenterId,
      )
      .map(cloneTemplate);
  }

  public async findTemplateById(
    _client: unknown,
    templateId: string,
    healthCenterId: string,
  ): Promise<ContentTemplateResponse | null> {
    const template = this.templates.find(
      (candidate) =>
        candidate.id === templateId &&
        (candidate.health_center_id === null || candidate.health_center_id === healthCenterId),
    );
    return template === undefined ? null : cloneTemplate(template);
  }

  public async findVersionById(
    _client: unknown,
    versionId: string,
    healthCenterId: string,
  ): Promise<ContentVersionResponse | null> {
    const template = this.templates.find(
      (candidate) =>
        (candidate.health_center_id === null || candidate.health_center_id === healthCenterId) &&
        candidate.versions.some((version) => version.id === versionId),
    );
    const version = template?.versions.find((candidate) => candidate.id === versionId);
    return version === undefined ? null : { ...version };
  }

  public async createTemplate(
    _client: TransactionClient,
    input: Parameters<ContentManagementRepository["createTemplate"]>[1],
  ): Promise<ContentTemplateResponse> {
    if (
      this.templates.some(
        (template) =>
          template.health_center_id === input.healthCenterId &&
          template.content_type === input.request.content_type,
      )
    ) {
      throw new ContentTemplateConflictError();
    }
    const createdAt = new Date("2026-08-13T04:00:00.000Z").toISOString();
    const template: ContentTemplateResponse = {
      id: input.templateId,
      health_center_id: input.healthCenterId,
      template_key: input.request.template_key,
      content_type: input.request.content_type,
      system_managed: false,
      created_at: createdAt,
      versions: [
        draftVersion({
          id: input.versionId,
          templateId: input.templateId,
          actorStaffId: input.actorStaffId,
          versionNo: 1,
          title: input.request.title,
          body: input.request.body,
          sourceReference: input.request.source_reference,
          placeholderKeys: [...input.placeholderKeys],
          createdAt,
        }),
      ],
    };
    this.templates.push(template);
    return cloneTemplate(template);
  }

  public async createVersion(
    _client: TransactionClient,
    input: Parameters<ContentManagementRepository["createVersion"]>[1],
  ): Promise<ContentVersionResponse> {
    const template = this.requireLocalTemplate(input.templateId, input.healthCenterId);
    if (
      template.versions.some((version) => ["DRAFT", "REVIEW", "APPROVED"].includes(version.status))
    ) {
      throw new ContentTemplateConflictError();
    }
    const version = draftVersion({
      id: input.versionId,
      templateId: template.id,
      actorStaffId: input.actorStaffId,
      versionNo: Math.max(...template.versions.map((item) => item.version_no)) + 1,
      title: input.request.title,
      body: input.request.body,
      sourceReference: input.request.source_reference,
      placeholderKeys: [...input.placeholderKeys],
      createdAt: "2026-08-13T04:05:00.000Z",
    });
    template.versions.unshift(version);
    return { ...version };
  }

  public async submitReview(
    _client: TransactionClient,
    versionId: string,
    healthCenterId: string,
    actorStaffId: string,
    occurredAt: Date,
  ): Promise<ContentVersionResponse> {
    return this.transition(versionId, healthCenterId, "DRAFT", "REVIEW", {
      submitted_by_staff_id: actorStaffId,
      submitted_at: occurredAt.toISOString(),
    });
  }

  public async approve(
    _client: TransactionClient,
    versionId: string,
    healthCenterId: string,
    actorStaffId: string,
    approvalReference: string,
    occurredAt: Date,
  ): Promise<ContentVersionResponse> {
    if (!this.clinicalOwnerIds.has(actorStaffId)) throw new ContentVersionNotFoundError();
    return this.transition(versionId, healthCenterId, "REVIEW", "APPROVED", {
      approved_by_staff_id: actorStaffId,
      approved_at: occurredAt.toISOString(),
      approval_reference: approvalReference,
    });
  }

  public async publish(
    _client: TransactionClient,
    versionId: string,
    healthCenterId: string,
    actorStaffId: string,
    occurredAt: Date,
  ): Promise<ContentVersionResponse> {
    if (!this.clinicalOwnerIds.has(actorStaffId)) throw new ContentVersionNotFoundError();
    const { template, version } = this.requireVersion(versionId, healthCenterId);
    if (version.status !== "APPROVED") throw new ContentVersionTransitionError();
    for (const prior of template.versions) {
      if (prior.status === "PUBLISHED") {
        Object.assign(prior, {
          status: "ARCHIVED" as const,
          archived_by_staff_id: actorStaffId,
          archived_at: occurredAt.toISOString(),
          production_eligible: false,
        });
      }
    }
    Object.assign(version, {
      status: "PUBLISHED" as const,
      published_by_staff_id: actorStaffId,
      published_at: occurredAt.toISOString(),
      production_eligible: true,
    });
    return { ...version };
  }

  public async archive(
    _client: TransactionClient,
    versionId: string,
    healthCenterId: string,
    actorStaffId: string,
    occurredAt: Date,
  ): Promise<ContentVersionResponse> {
    if (!this.clinicalOwnerIds.has(actorStaffId)) throw new ContentVersionNotFoundError();
    return this.transition(versionId, healthCenterId, "PUBLISHED", "ARCHIVED", {
      archived_by_staff_id: actorStaffId,
      archived_at: occurredAt.toISOString(),
      production_eligible: false,
    });
  }

  private transition(
    versionId: string,
    healthCenterId: string,
    expected: ContentVersionStatus,
    target: ContentVersionStatus,
    patch: Partial<ContentVersionResponse>,
  ): ContentVersionResponse {
    const { version } = this.requireVersion(versionId, healthCenterId);
    if (version.status !== expected) throw new ContentVersionTransitionError();
    Object.assign(version, patch, { status: target });
    return { ...version };
  }

  private requireLocalTemplate(
    templateId: string,
    healthCenterId: string,
  ): ContentTemplateResponse {
    const template = this.templates.find(
      (candidate) => candidate.id === templateId && candidate.health_center_id === healthCenterId,
    );
    if (template === undefined) throw new ContentVersionNotFoundError();
    return template;
  }

  private requireVersion(
    versionId: string,
    healthCenterId: string,
  ): { template: ContentTemplateResponse; version: ContentVersionResponse } {
    const template = this.templates.find(
      (candidate) =>
        candidate.health_center_id === healthCenterId &&
        candidate.versions.some((version) => version.id === versionId),
    );
    const version = template?.versions.find((candidate) => candidate.id === versionId);
    if (template === undefined || version === undefined) throw new ContentVersionNotFoundError();
    return { template, version };
  }
}

function draftVersion(input: {
  id: string;
  templateId: string;
  actorStaffId: string;
  versionNo: number;
  title: string;
  body: string;
  sourceReference: string;
  placeholderKeys: ContentVersionResponse["placeholder_keys"];
  createdAt: string;
}): ContentVersionResponse {
  return {
    id: input.id,
    content_template_id: input.templateId,
    version_no: input.versionNo,
    status: "DRAFT",
    title: input.title,
    body: input.body,
    placeholder_keys: input.placeholderKeys,
    source_reference: input.sourceReference,
    approval_reference: null,
    created_by_staff_id: input.actorStaffId,
    submitted_by_staff_id: null,
    submitted_at: null,
    approved_by_staff_id: null,
    approved_at: null,
    published_by_staff_id: null,
    published_at: null,
    archived_by_staff_id: null,
    archived_at: null,
    created_at: input.createdAt,
    production_eligible: false,
  };
}

function cloneTemplate(template: ContentTemplateResponse): ContentTemplateResponse {
  return { ...template, versions: template.versions.map((version) => ({ ...version })) };
}
