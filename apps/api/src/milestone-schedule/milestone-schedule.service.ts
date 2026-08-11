import { randomUUID } from "node:crypto";
import { HttpStatus, Inject, Injectable } from "@nestjs/common";
import type { ApiConfig } from "@anc/config";
import type {
  MilestoneCode,
  MilestoneDueDateMutationRequest,
  MilestoneDueDateMutationResponse,
} from "@anc/contracts";

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
  MILESTONE_SCHEDULE_REPOSITORY,
} from "../infrastructure/tokens.js";
import { startOfLocalDate } from "../time/local-date.js";
import {
  MilestoneDueDateBeforePregnancyError,
  MilestoneDueDateUnchangedError,
  MilestoneNotSchedulableError,
  MilestonePregnancyNotActiveError,
  MilestoneRescheduleReasonRequiredError,
  MilestoneScheduleChangedError,
  MilestoneScheduleTargetUnavailableError,
  type MilestoneScheduleRepository,
} from "./milestone-schedule.repository.js";

@Injectable()
export class MilestoneScheduleService {
  public constructor(
    @Inject(MILESTONE_SCHEDULE_REPOSITORY)
    private readonly repository: MilestoneScheduleRepository,
    @Inject(AUDIT_SERVICE) private readonly audit: AuditService,
    @Inject(IDEMPOTENCY_SERVICE) private readonly idempotency: IdempotencyService,
    @Inject(API_CONFIG) private readonly config: ApiConfig,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly policy: AuthorizationPolicy,
  ) {}

  public async setDueDate(
    actor: StaffActor,
    pregnancyId: string,
    code: MilestoneCode,
    input: MilestoneDueDateMutationRequest,
  ): Promise<MilestoneDueDateMutationResponse> {
    const healthCenterId = this.requireManagedCenter(actor);
    const occurredAt = this.clock();
    const dueAt = startOfLocalDate(input.due_date, this.config.primaryTimezone);

    try {
      const outcome = await this.idempotency.runForStaff(
        {
          actor,
          operation: "MILESTONE_DUE_DATE_SET",
          idempotencyKey: input.idempotency_key,
          requestIdentity: { pregnancy_id: pregnancyId, code, ...input },
        },
        async (client) => {
          const result = await this.repository.scheduleDueDate(client, {
            eventId: randomUUID(),
            pregnancyId,
            code,
            healthCenterId,
            actorStaffId: actor.staffUserId,
            dueDate: input.due_date,
            expectedDueDate: input.expected_due_date,
            dueAt,
            timezone: this.config.primaryTimezone,
            reason: input.reason ?? null,
            occurredAt,
          });
          return {
            resourceType: "MILESTONE_SCHEDULE_EVENT",
            resourceId: result.event_id,
            value: result,
          };
        },
        async (client, resource) => {
          if (resource.resourceType !== "MILESTONE_SCHEDULE_EVENT") {
            throw new Error("Unexpected milestone schedule idempotency resource type");
          }
          const result = await this.repository.findScheduleMutation(
            client,
            resource.resourceId,
            healthCenterId,
          );
          if (result === null) throw new Error("Milestone schedule replay resource is missing");
          return result;
        },
      );
      if (!outcome.replayed) {
        await this.audit.record({
          actorType: "STAFF",
          actorId: actor.staffUserId,
          action:
            outcome.value.action === "SCHEDULED" ? "MILESTONE_SCHEDULED" : "MILESTONE_RESCHEDULED",
          resourceType: "PREGNANCY_MILESTONE",
          resourceId: outcome.value.milestone_id,
          occurredAt,
        });
      }
      return outcome.value;
    } catch (error) {
      throw mapScheduleError(error);
    }
  }

  private requireManagedCenter(actor: StaffActor): string {
    this.policy.assertCapability(actor, "MILESTONE_SCHEDULE");
    if (actor.healthCenterId === null) throw forbidden();
    return actor.healthCenterId;
  }
}

function mapScheduleError(error: unknown): unknown {
  if (error instanceof MilestoneScheduleTargetUnavailableError || isDatabaseError(error, "23503")) {
    return forbidden();
  }
  if (error instanceof MilestonePregnancyNotActiveError) {
    return new ApiException({
      status: HttpStatus.CONFLICT,
      code: "PREGNANCY_NOT_ACTIVE",
      message: "Kehamilan tidak berada dalam status aktif.",
    });
  }
  if (error instanceof MilestoneNotSchedulableError) {
    return new ApiException({
      status: HttpStatus.CONFLICT,
      code: "MILESTONE_NOT_SCHEDULABLE",
      message: "Milestone yang sudah terminal tidak dapat dijadwalkan ulang.",
    });
  }
  if (error instanceof MilestoneScheduleChangedError) {
    return new ApiException({
      status: HttpStatus.CONFLICT,
      code: "MILESTONE_SCHEDULE_CHANGED",
      message: "Jadwal telah berubah. Muat ulang data sebelum mencoba kembali.",
    });
  }
  if (error instanceof MilestoneDueDateUnchangedError) {
    return new ApiException({
      status: HttpStatus.CONFLICT,
      code: "MILESTONE_DUE_DATE_UNCHANGED",
      message: "Tanggal target tidak berubah.",
    });
  }
  if (error instanceof MilestoneDueDateBeforePregnancyError) {
    return new ApiException({
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      code: "MILESTONE_DUE_DATE_BEFORE_PREGNANCY",
      message: "Tanggal target tidak boleh lebih awal dari tanggal awal kehamilan.",
      fields: { due_date: "must not precede the pregnancy start date" },
    });
  }
  if (error instanceof MilestoneRescheduleReasonRequiredError) {
    return new ApiException({
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      code: "MILESTONE_RESCHEDULE_REASON_REQUIRED",
      message: "Alasan wajib diisi saat mengubah jadwal.",
      fields: { reason: "is required when rescheduling" },
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
