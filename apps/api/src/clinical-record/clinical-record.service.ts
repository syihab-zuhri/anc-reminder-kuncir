import { randomUUID } from "node:crypto";
import { HttpStatus, Inject, Injectable } from "@nestjs/common";
import type {
  ClinicalRecordReopenRequest,
  ClinicalRecordResponse,
  ClinicalRecordSaveRequest,
  ClinicalRecordValidateRequest,
} from "@anc/contracts";

import type { AuditService } from "../audit/audit.service.js";
import type { Clock } from "../auth/staff-auth.service.js";
import type { StaffActor } from "../auth/staff-auth.types.js";
import { AuthorizationPolicy, forbidden } from "../authorization/authorization.policy.js";
import { ApiException } from "../errors/api.exception.js";
import { IdempotencyService } from "../idempotency/idempotency.service.js";
import {
  AUDIT_SERVICE,
  CLINICAL_RECORD_REPOSITORY,
  CLOCK,
  IDEMPOTENCY_SERVICE,
} from "../infrastructure/tokens.js";
import {
  ClinicalRecordAlreadyIncompleteError,
  ClinicalRecordHistoryMissingError,
  ClinicalRecordMilestoneTerminalError,
  ClinicalRecordNotFoundError,
  ClinicalRecordPregnancyNotActiveError,
  ClinicalRecordReopenRequiredError,
  ClinicalRecordRevisionChangedError,
  ClinicalRecordTargetUnavailableError,
  ClinicalRecordVisitNotConfirmedError,
  type ClinicalRecordMutationResult,
  type ClinicalRecordRepository,
} from "./clinical-record.repository.js";
import { ProgramStatusService } from "../program-status/program-status.service.js";

@Injectable()
export class ClinicalRecordService {
  public constructor(
    @Inject(CLINICAL_RECORD_REPOSITORY)
    private readonly repository: ClinicalRecordRepository,
    @Inject(AUDIT_SERVICE) private readonly audit: AuditService,
    @Inject(IDEMPOTENCY_SERVICE) private readonly idempotency: IdempotencyService,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly policy: AuthorizationPolicy,
    private readonly programStatus: ProgramStatusService,
  ) {}

  public async get(actor: StaffActor, milestoneId: string): Promise<ClinicalRecordResponse> {
    const healthCenterId = this.requireManagedCenter(actor);
    try {
      const record = await this.repository.findCurrentRecord(milestoneId, healthCenterId);
      if (record === null) throw new ClinicalRecordNotFoundError();
      return record;
    } catch (error) {
      throw mapClinicalRecordError(error);
    }
  }

  public async save(
    actor: StaffActor,
    milestoneId: string,
    input: ClinicalRecordSaveRequest,
  ): Promise<ClinicalRecordResponse> {
    const healthCenterId = this.requireManagedCenter(actor);
    const occurredAt = this.clock();
    try {
      const outcome = await this.idempotency.runForStaff<ClinicalRecordMutationResult>(
        {
          actor,
          operation: "K1_K6_RECORD_SAVE",
          idempotencyKey: input.idempotency_key,
          requestIdentity: { milestone_id: milestoneId, ...input },
        },
        async (client) => {
          const mutation = await this.repository.save(client, {
            recordId: randomUUID(),
            revisionId: randomUUID(),
            milestoneId,
            healthCenterId,
            actorStaffId: actor.staffUserId,
            expectedRevisionId: input.expected_revision_id,
            schemaVersion: input.schema_version,
            recordPayload: input.record_payload,
            occurredAt,
          });
          return {
            resourceType: "K1_K6_RECORD_REVISION",
            resourceId: mutation.record.revision_id,
            value: mutation,
          };
        },
        async (client, resource) => {
          if (resource.resourceType !== "K1_K6_RECORD_REVISION") {
            throw new Error("Unexpected clinical record idempotency resource type");
          }
          const record = await this.repository.findSaveMutation(
            client,
            resource.resourceId,
            healthCenterId,
          );
          if (record === null)
            throw new Error("Clinical record revision replay resource is missing");
          return { created: false, mutationId: resource.resourceId, record };
        },
      );
      if (!outcome.replayed && outcome.value.created) {
        await this.recordAudit(actor, "K1_K6_RECORD_SAVED", outcome.value.record, occurredAt);
        await this.programStatus.evaluateSystemForMilestone(outcome.value.record.milestone_id);
      }
      return outcome.value.record;
    } catch (error) {
      throw mapClinicalRecordError(error);
    }
  }

  public async validate(
    actor: StaffActor,
    milestoneId: string,
    input: ClinicalRecordValidateRequest,
  ): Promise<ClinicalRecordResponse> {
    return this.changeValidation(actor, milestoneId, {
      operation: "K1_K6_RECORD_VALIDATE",
      idempotencyKey: input.idempotency_key,
      expectedRevisionId: input.expected_revision_id,
      requestIdentity: input,
      reason: null,
      action: "RECORD_VALIDATED",
      mutate: "validate",
    });
  }

  public async reopen(
    actor: StaffActor,
    milestoneId: string,
    input: ClinicalRecordReopenRequest,
  ): Promise<ClinicalRecordResponse> {
    return this.changeValidation(actor, milestoneId, {
      operation: "K1_K6_RECORD_REOPEN",
      idempotencyKey: input.idempotency_key,
      expectedRevisionId: input.expected_revision_id,
      requestIdentity: input,
      reason: input.reason,
      action: "RECORD_REOPENED",
      mutate: "reopen",
    });
  }

  private async changeValidation(
    actor: StaffActor,
    milestoneId: string,
    input: {
      readonly operation: string;
      readonly idempotencyKey: string;
      readonly expectedRevisionId: string;
      readonly requestIdentity: unknown;
      readonly reason: string | null;
      readonly action: "RECORD_VALIDATED" | "RECORD_REOPENED";
      readonly mutate: "validate" | "reopen";
    },
  ): Promise<ClinicalRecordResponse> {
    const healthCenterId = this.requireManagedCenter(actor);
    const occurredAt = this.clock();
    try {
      const outcome = await this.idempotency.runForStaff<ClinicalRecordMutationResult>(
        {
          actor,
          operation: input.operation,
          idempotencyKey: input.idempotencyKey,
          requestIdentity: { milestone_id: milestoneId, input: input.requestIdentity },
        },
        async (client) => {
          const mutation = await this.repository[input.mutate](client, {
            eventId: randomUUID(),
            milestoneId,
            healthCenterId,
            actorStaffId: actor.staffUserId,
            expectedRevisionId: input.expectedRevisionId,
            occurredAt,
            reason: input.reason,
          });
          return {
            resourceType: "RECORD_VALIDATION_EVENT",
            resourceId: mutation.mutationId,
            value: mutation,
          };
        },
        async (client, resource) => {
          if (resource.resourceType !== "RECORD_VALIDATION_EVENT") {
            throw new Error("Unexpected record validation idempotency resource type");
          }
          const record = await this.repository.findValidationMutation(
            client,
            resource.resourceId,
            healthCenterId,
          );
          if (record === null) throw new Error("Record validation replay resource is missing");
          return { created: false, mutationId: resource.resourceId, record };
        },
      );
      if (!outcome.replayed && outcome.value.created) {
        await this.recordAudit(actor, input.action, outcome.value.record, occurredAt);
        await this.programStatus.evaluateSystemForMilestone(outcome.value.record.milestone_id);
      }
      return outcome.value.record;
    } catch (error) {
      throw mapClinicalRecordError(error);
    }
  }

  private requireManagedCenter(actor: StaffActor): string {
    this.policy.assertCapability(actor, "CLINICAL_RECORD_WRITE");
    if (actor.healthCenterId === null) throw forbidden();
    return actor.healthCenterId;
  }

  private async recordAudit(
    actor: StaffActor,
    action: string,
    record: ClinicalRecordResponse,
    occurredAt: Date,
  ): Promise<void> {
    await this.audit.record({
      actorType: "STAFF",
      actorId: actor.staffUserId,
      action,
      resourceType: "K1_K6_RECORD",
      resourceId: record.record_id,
      occurredAt,
    });
  }
}

function mapClinicalRecordError(error: unknown): unknown {
  if (error instanceof ClinicalRecordTargetUnavailableError || isDatabaseError(error, "23503")) {
    return forbidden();
  }
  if (error instanceof ClinicalRecordNotFoundError) {
    return new ApiException({
      status: HttpStatus.NOT_FOUND,
      code: "CLINICAL_RECORD_NOT_FOUND",
      message: "Detail pencatatan belum tersedia.",
    });
  }
  if (error instanceof ClinicalRecordPregnancyNotActiveError) {
    return new ApiException({
      status: HttpStatus.CONFLICT,
      code: "PREGNANCY_NOT_ACTIVE",
      message: "Kehamilan tidak berada dalam status aktif.",
    });
  }
  if (error instanceof ClinicalRecordMilestoneTerminalError) {
    return new ApiException({
      status: HttpStatus.CONFLICT,
      code: "CLINICAL_RECORD_MILESTONE_TERMINAL",
      message: "Milestone tidak dapat menerima perubahan detail.",
    });
  }
  if (error instanceof ClinicalRecordRevisionChangedError) {
    return new ApiException({
      status: HttpStatus.CONFLICT,
      code: "CLINICAL_RECORD_REVISION_CHANGED",
      message: "Detail telah berubah. Muat ulang sebelum mencoba kembali.",
    });
  }
  if (error instanceof ClinicalRecordReopenRequiredError) {
    return new ApiException({
      status: HttpStatus.CONFLICT,
      code: "CLINICAL_RECORD_REOPEN_REQUIRED",
      message: "Detail yang sudah divalidasi harus dibuka kembali sebelum diedit.",
    });
  }
  if (error instanceof ClinicalRecordVisitNotConfirmedError) {
    return new ApiException({
      status: HttpStatus.CONFLICT,
      code: "VISIT_CONFIRMATION_REQUIRED",
      message: "Kunjungan harus dikonfirmasi sebelum validasi final detail.",
    });
  }
  if (error instanceof ClinicalRecordAlreadyIncompleteError) {
    return new ApiException({
      status: HttpStatus.CONFLICT,
      code: "CLINICAL_RECORD_ALREADY_INCOMPLETE",
      message: "Detail sudah berada dalam status belum lengkap.",
    });
  }
  if (error instanceof ClinicalRecordHistoryMissingError) {
    return new ApiException({
      status: HttpStatus.CONFLICT,
      code: "CLINICAL_RECORD_STATE_INCONSISTENT",
      message: "Riwayat detail pencatatan tidak konsisten.",
    });
  }
  if (isDatabaseError(error, "23505")) {
    return new ApiException({
      status: HttpStatus.CONFLICT,
      code: "CLINICAL_RECORD_CONFLICT",
      message: "Detail telah diubah oleh proses lain.",
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
