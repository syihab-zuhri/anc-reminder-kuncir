import { randomUUID } from "node:crypto";
import { HttpStatus, Inject, Injectable } from "@nestjs/common";
import type { ApiConfig } from "@anc/config";
import type {
  PregnancyCloseRequest,
  PregnancyCreateRequest,
  PregnancyDatingRevisionRequest,
  PregnancyLifecycleResponse,
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
  PREGNANCY_LIFECYCLE_REPOSITORY,
} from "../infrastructure/tokens.js";
import {
  ActiveAncPlanInvalidError,
  ActiveAncPlanUnavailableError,
} from "./mother-registry.repository.js";
import {
  ActivePregnancyExistsError,
  PregnancyDatingUnchangedError,
  PregnancyNotActiveError,
  PregnancyTargetUnavailableError,
  type PregnancyLifecycleRepository,
} from "./pregnancy-lifecycle.repository.js";
import { assertPregnancyStartDateNotFuture } from "./registry-validation.js";

@Injectable()
export class PregnancyLifecycleService {
  public constructor(
    @Inject(PREGNANCY_LIFECYCLE_REPOSITORY)
    private readonly repository: PregnancyLifecycleRepository,
    @Inject(AUDIT_SERVICE) private readonly audit: AuditService,
    @Inject(IDEMPOTENCY_SERVICE) private readonly idempotency: IdempotencyService,
    @Inject(API_CONFIG) private readonly config: ApiConfig,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly policy: AuthorizationPolicy,
  ) {}

  public async create(
    actor: StaffActor,
    motherId: string,
    input: PregnancyCreateRequest,
  ): Promise<PregnancyLifecycleResponse> {
    const healthCenterId = this.requireManagedCenter(actor);
    const now = this.clock();
    assertPregnancyStartDateNotFuture(input.pregnancy_start_date, now, this.config.primaryTimezone);

    try {
      const outcome = await this.idempotency.runForStaff(
        {
          actor,
          operation: "PREGNANCY_CREATE",
          idempotencyKey: input.idempotency_key,
          requestIdentity: { mother_id: motherId, ...input },
        },
        async (client) => {
          const mutation = await this.repository.create(client, {
            pregnancyId: randomUUID(),
            lifecycleEventId: randomUUID(),
            motherId,
            healthCenterId,
            actorStaffId: actor.staffUserId,
            pregnancyStartDate: input.pregnancy_start_date,
            occurredAt: now,
          });
          return {
            resourceType: "PREGNANCY_LIFECYCLE_EVENT",
            resourceId: mutation.mutationId,
            value: mutation.pregnancy,
          };
        },
        async (client, resource) => {
          this.assertResourceType(resource.resourceType, "PREGNANCY_LIFECYCLE_EVENT");
          const pregnancy = await this.repository.findLifecycleMutation(
            client,
            resource.resourceId,
            healthCenterId,
            "CREATED",
          );
          if (pregnancy === null) throw new Error("Pregnancy creation replay resource is missing");
          return pregnancy;
        },
      );
      if (!outcome.replayed) {
        await this.audit.record({
          actorType: "STAFF",
          actorId: actor.staffUserId,
          action: "PREGNANCY_CREATED",
          resourceType: "PREGNANCY",
          resourceId: outcome.value.id,
        });
      }
      return outcome.value;
    } catch (error) {
      throw mapLifecycleError(error);
    }
  }

  public async reviseDating(
    actor: StaffActor,
    pregnancyId: string,
    input: PregnancyDatingRevisionRequest,
  ): Promise<PregnancyLifecycleResponse> {
    const healthCenterId = this.requireManagedCenter(actor);
    const now = this.clock();
    assertPregnancyStartDateNotFuture(input.pregnancy_start_date, now, this.config.primaryTimezone);

    try {
      const outcome = await this.idempotency.runForStaff(
        {
          actor,
          operation: "PREGNANCY_DATING_REVISE",
          idempotencyKey: input.idempotency_key,
          requestIdentity: { pregnancy_id: pregnancyId, ...input },
        },
        async (client) => {
          const mutation = await this.repository.reviseDating(client, {
            revisionId: randomUUID(),
            pregnancyId,
            healthCenterId,
            actorStaffId: actor.staffUserId,
            pregnancyStartDate: input.pregnancy_start_date,
            reason: input.reason,
            revisedAt: now,
          });
          return {
            resourceType: "PREGNANCY_DATING_REVISION",
            resourceId: mutation.mutationId,
            value: mutation.pregnancy,
          };
        },
        async (client, resource) => {
          this.assertResourceType(resource.resourceType, "PREGNANCY_DATING_REVISION");
          const pregnancy = await this.repository.findDatingRevisionMutation(
            client,
            resource.resourceId,
            healthCenterId,
          );
          if (pregnancy === null) throw new Error("Pregnancy dating replay resource is missing");
          return pregnancy;
        },
      );
      if (!outcome.replayed) {
        await this.audit.record({
          actorType: "STAFF",
          actorId: actor.staffUserId,
          action: "PREGNANCY_DATING_REVISED",
          resourceType: "PREGNANCY",
          resourceId: outcome.value.id,
          metadata: { reason: input.reason },
        });
      }
      return outcome.value;
    } catch (error) {
      throw mapLifecycleError(error);
    }
  }

  public async close(
    actor: StaffActor,
    pregnancyId: string,
    input: PregnancyCloseRequest,
  ): Promise<PregnancyLifecycleResponse> {
    const healthCenterId = this.requireManagedCenter(actor);
    const now = this.clock();

    try {
      const outcome = await this.idempotency.runForStaff(
        {
          actor,
          operation: "PREGNANCY_CLOSE",
          idempotencyKey: input.idempotency_key,
          requestIdentity: { pregnancy_id: pregnancyId, ...input },
        },
        async (client) => {
          const mutation = await this.repository.close(client, {
            lifecycleEventId: randomUUID(),
            pregnancyId,
            healthCenterId,
            actorStaffId: actor.staffUserId,
            reason: input.reason,
            closedAt: now,
          });
          return {
            resourceType: "PREGNANCY_LIFECYCLE_EVENT",
            resourceId: mutation.mutationId,
            value: mutation.pregnancy,
          };
        },
        async (client, resource) => {
          this.assertResourceType(resource.resourceType, "PREGNANCY_LIFECYCLE_EVENT");
          const pregnancy = await this.repository.findLifecycleMutation(
            client,
            resource.resourceId,
            healthCenterId,
            "CLOSED",
          );
          if (pregnancy === null) throw new Error("Pregnancy close replay resource is missing");
          return pregnancy;
        },
      );
      if (!outcome.replayed) {
        await this.audit.record({
          actorType: "STAFF",
          actorId: actor.staffUserId,
          action: "PREGNANCY_CLOSED",
          resourceType: "PREGNANCY",
          resourceId: outcome.value.id,
          metadata: { reason: input.reason },
        });
      }
      return outcome.value;
    } catch (error) {
      throw mapLifecycleError(error);
    }
  }

  private requireManagedCenter(actor: StaffActor): string {
    this.policy.assertCapability(actor, "MOTHER_REGISTRY_MANAGE");
    if (actor.healthCenterId === null) throw forbidden();
    return actor.healthCenterId;
  }

  private assertResourceType(actual: string, expected: string): void {
    if (actual !== expected) throw new Error("Unexpected pregnancy idempotency resource type");
  }
}

function mapLifecycleError(error: unknown): unknown {
  if (error instanceof PregnancyTargetUnavailableError || isDatabaseError(error, "23503")) {
    return forbidden();
  }
  if (error instanceof ActivePregnancyExistsError || isDatabaseError(error, "23505")) {
    return new ApiException({
      status: HttpStatus.CONFLICT,
      code: "ACTIVE_PREGNANCY_EXISTS",
      message: "Ibu tersebut sudah memiliki kehamilan aktif.",
    });
  }
  if (error instanceof PregnancyNotActiveError) {
    return new ApiException({
      status: HttpStatus.CONFLICT,
      code: "PREGNANCY_NOT_ACTIVE",
      message: "Kehamilan tidak berada dalam status aktif.",
    });
  }
  if (error instanceof PregnancyDatingUnchangedError) {
    return new ApiException({
      status: HttpStatus.CONFLICT,
      code: "PREGNANCY_DATING_UNCHANGED",
      message: "Tanggal awal kehamilan tidak berubah.",
    });
  }
  if (
    error instanceof ActiveAncPlanUnavailableError ||
    error instanceof ActiveAncPlanInvalidError
  ) {
    return new ApiException({
      status: HttpStatus.CONFLICT,
      code: "PREGNANCY_CREATION_NOT_READY",
      message: "Kehamilan baru belum dapat dibuat karena rencana ANC aktif belum tersedia.",
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
