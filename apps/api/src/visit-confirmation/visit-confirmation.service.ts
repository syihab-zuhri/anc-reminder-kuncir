import { randomUUID } from "node:crypto";
import { HttpStatus, Inject, Injectable } from "@nestjs/common";
import type { ApiConfig } from "@anc/config";
import type { VisitConfirmationRequest, VisitConfirmationResponse } from "@anc/contracts";

import type { AuditService } from "../audit/audit.service.js";
import type { Clock } from "../auth/staff-auth.service.js";
import type { StaffActor } from "../auth/staff-auth.types.js";
import { AuthorizationPolicy, forbidden } from "../authorization/authorization.policy.js";
import { ApiException } from "../errors/api.exception.js";
import { IdempotencyService } from "../idempotency/idempotency.service.js";
import {
  API_CONFIG,
  AUDIT_SERVICE,
  CLOCK,
  IDEMPOTENCY_SERVICE,
  VISIT_CONFIRMATION_REPOSITORY,
} from "../infrastructure/tokens.js";
import { dateOnlyInTimezone } from "../registry/registry-validation.js";
import {
  VisitConfirmationCodeForbiddenError,
  VisitConfirmationCorrectionRequiredError,
  VisitConfirmationDateBeforePregnancyError,
  VisitConfirmationFacilityNotAllowedError,
  VisitConfirmationFacilityUnavailableError,
  VisitConfirmationHistoryMissingError,
  VisitConfirmationInvalidTransitionError,
  VisitConfirmationPregnancyNotActiveError,
  VisitConfirmationTargetUnavailableError,
  type VisitConfirmationMutationResult,
  type VisitConfirmationRepository,
} from "./visit-confirmation.repository.js";

@Injectable()
export class VisitConfirmationService {
  public constructor(
    @Inject(VISIT_CONFIRMATION_REPOSITORY)
    private readonly repository: VisitConfirmationRepository,
    @Inject(AUDIT_SERVICE) private readonly audit: AuditService,
    @Inject(IDEMPOTENCY_SERVICE) private readonly idempotency: IdempotencyService,
    @Inject(API_CONFIG) private readonly config: ApiConfig,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly policy: AuthorizationPolicy,
  ) {}

  public async confirm(
    actor: StaffActor,
    milestoneId: string,
    input: VisitConfirmationRequest,
  ): Promise<VisitConfirmationResponse> {
    const healthCenterId = this.requireConfirmationScope(actor);
    const confirmedAt = this.clock();
    if (input.occurred_on > dateOnlyInTimezone(confirmedAt, this.config.primaryTimezone)) {
      throw new ApiException({
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        code: "VISIT_OCCURRENCE_DATE_IN_FUTURE",
        message: "Tanggal pemeriksaan tidak boleh berada di masa depan.",
        fields: { occurred_on: "must not be in the future" },
      });
    }

    try {
      const outcome = await this.idempotency.runForStaff<VisitConfirmationMutationResult>(
        {
          actor,
          operation: "VISIT_CONFIRM",
          idempotencyKey: input.idempotency_key,
          requestIdentity: { milestone_id: milestoneId, ...input },
        },
        async (client) => {
          const mutation = await this.repository.confirm(client, {
            confirmationId: randomUUID(),
            milestoneId,
            actorStaffId: actor.staffUserId,
            actorRole: actor.role,
            healthCenterId,
            occurredOn: input.occurred_on,
            facilityId: input.facility_id,
            confirmedAt,
          });
          return {
            resourceType: "VISIT_CONFIRMATION",
            resourceId: mutation.confirmation.id,
            value: mutation,
          };
        },
        async (client, resource) => {
          if (resource.resourceType !== "VISIT_CONFIRMATION") {
            throw new Error("Unexpected visit confirmation idempotency resource type");
          }
          const confirmation = await this.repository.findConfirmationMutation(
            client,
            resource.resourceId,
            {
              actorStaffId: actor.staffUserId,
              actorRole: actor.role,
              healthCenterId,
            },
          );
          if (confirmation === null)
            throw new Error("Visit confirmation replay resource is missing");
          return { created: false, confirmation };
        },
      );
      if (!outcome.replayed && outcome.value.created) {
        await this.audit.record({
          actorType: "STAFF",
          actorId: actor.staffUserId,
          action: "VISIT_CONFIRMED",
          resourceType: "PREGNANCY_MILESTONE",
          resourceId: outcome.value.confirmation.milestone_id,
          occurredAt: confirmedAt,
        });
      }
      return outcome.value.confirmation;
    } catch (error) {
      throw mapConfirmationError(error);
    }
  }

  private requireConfirmationScope(actor: StaffActor): string {
    if (actor.role === "BIDAN") {
      this.policy.assertCapability(actor, "VISIT_CONFIRM_FLEXIBLE");
    } else {
      this.policy.assertCapability(actor, "VISIT_CONFIRM_PUSKESMAS");
    }
    if (actor.healthCenterId === null) throw forbidden();
    return actor.healthCenterId;
  }
}

function mapConfirmationError(error: unknown): unknown {
  if (
    error instanceof VisitConfirmationTargetUnavailableError ||
    error instanceof VisitConfirmationCodeForbiddenError ||
    isDatabaseError(error, "23503")
  ) {
    return forbidden();
  }
  if (error instanceof VisitConfirmationPregnancyNotActiveError) {
    return new ApiException({
      status: HttpStatus.CONFLICT,
      code: "PREGNANCY_NOT_ACTIVE",
      message: "Kehamilan tidak berada dalam status aktif.",
    });
  }
  if (error instanceof VisitConfirmationInvalidTransitionError) {
    return new ApiException({
      status: HttpStatus.CONFLICT,
      code: "VISIT_CONFIRMATION_INVALID_TRANSITION",
      message: "Status milestone tidak dapat dikonfirmasi.",
    });
  }
  if (error instanceof VisitConfirmationCorrectionRequiredError) {
    return new ApiException({
      status: HttpStatus.CONFLICT,
      code: "VISIT_CONFIRMATION_CORRECTION_REQUIRED",
      message: "Data konfirmasi berbeda. Gunakan alur koreksi Puskesmas.",
    });
  }
  if (error instanceof VisitConfirmationHistoryMissingError) {
    return new ApiException({
      status: HttpStatus.CONFLICT,
      code: "VISIT_CONFIRMATION_STATE_INCONSISTENT",
      message: "Riwayat konfirmasi milestone tidak konsisten.",
    });
  }
  if (error instanceof VisitConfirmationFacilityUnavailableError) {
    return new ApiException({
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      code: "VISIT_FACILITY_NOT_AVAILABLE",
      message: "Fasilitas pemeriksaan tidak tersedia dalam cakupan ini.",
      fields: { facility_id: "must identify an active same-center facility" },
    });
  }
  if (error instanceof VisitConfirmationFacilityNotAllowedError) {
    return new ApiException({
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      code: "FACILITY_NOT_ALLOWED_FOR_MILESTONE",
      message: "Jenis fasilitas tidak diizinkan untuk milestone ini.",
      fields: { facility_id: "facility type is not allowed by the milestone rule" },
    });
  }
  if (error instanceof VisitConfirmationDateBeforePregnancyError) {
    return new ApiException({
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      code: "VISIT_DATE_BEFORE_PREGNANCY",
      message: "Tanggal pemeriksaan tidak boleh lebih awal dari tanggal awal kehamilan.",
      fields: { occurred_on: "must not precede the pregnancy start date" },
    });
  }
  if (isDatabaseError(error, "23505")) {
    return new ApiException({
      status: HttpStatus.CONFLICT,
      code: "VISIT_CONFIRMATION_CONFLICT",
      message: "Milestone telah dikonfirmasi oleh proses lain.",
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
