import { randomUUID } from "node:crypto";
import { HttpStatus, Inject, Injectable } from "@nestjs/common";
import type {
  MotherAccessCredentialIssueResponse,
  MotherAccessCredentialMutationRequest,
  MotherAccessCredentialRevokeResponse,
} from "@anc/contracts";

import type { AuditService } from "../audit/audit.service.js";
import type { Clock } from "../auth/staff-auth.service.js";
import type { StaffActor } from "../auth/staff-auth.types.js";
import { AuthorizationPolicy, forbidden } from "../authorization/authorization.policy.js";
import { ApiException } from "../errors/api.exception.js";
import { IdempotencyService } from "../idempotency/idempotency.service.js";
import {
  AUDIT_SERVICE,
  CLOCK,
  IDEMPOTENCY_SERVICE,
  MOTHER_ACCESS_CREDENTIAL_REPOSITORY,
} from "../infrastructure/tokens.js";
import { MotherAccessCodeService } from "./mother-access-code.service.js";
import {
  MotherAccessCredentialNotActiveError,
  MotherAccessTargetUnavailableError,
  type MotherAccessCredentialRepository,
} from "./mother-access-credential.repository.js";

@Injectable()
export class MotherAccessCredentialService {
  public constructor(
    @Inject(MOTHER_ACCESS_CREDENTIAL_REPOSITORY)
    private readonly repository: MotherAccessCredentialRepository,
    @Inject(AUDIT_SERVICE) private readonly audit: AuditService,
    @Inject(IDEMPOTENCY_SERVICE) private readonly idempotency: IdempotencyService,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly policy: AuthorizationPolicy,
    private readonly codes: MotherAccessCodeService,
  ) {}

  public async reissue(
    actor: StaffActor,
    motherId: string,
    input: MotherAccessCredentialMutationRequest,
  ): Promise<MotherAccessCredentialIssueResponse> {
    const healthCenterId = this.requireManagedCenter(actor);
    const now = this.clock();

    try {
      const outcome = await this.idempotency.runForStaff<MotherAccessCredentialIssueResponse>(
        {
          actor,
          operation: "MOTHER_ACCESS_CODE_REISSUE",
          idempotencyKey: input.idempotency_key,
          requestIdentity: { mother_id: motherId, ...input },
        },
        async (client) => {
          const issued = await this.codes.issue();
          const mutation = await this.repository.reissue(client, {
            credentialId: randomUUID(),
            issuedEventId: randomUUID(),
            revokedEventId: randomUUID(),
            motherId,
            healthCenterId,
            actorStaffId: actor.staffUserId,
            codeHash: issued.hash,
            reason: input.reason,
            occurredAt: now,
          });
          return {
            resourceType: "MOTHER_ACCESS_CREDENTIAL_EVENT",
            resourceId: mutation.mutationId,
            value: {
              ...mutation.credential,
              one_time_code: issued.plaintext,
              code_delivery: "DISPLAY_ONCE" as const,
            },
          };
        },
        async (client, resource) => {
          this.assertResourceType(resource.resourceType);
          const credential = await this.repository.findIssueMutation(
            client,
            resource.resourceId,
            healthCenterId,
          );
          if (credential === null)
            throw new Error("Credential issuance replay resource is missing");
          return {
            ...credential,
            one_time_code: null,
            code_delivery: "NOT_AVAILABLE_ON_REPLAY" as const,
          };
        },
      );

      if (!outcome.replayed) {
        await this.audit.record({
          actorType: "STAFF",
          actorId: actor.staffUserId,
          action:
            outcome.value.issuance_type === "ISSUED"
              ? "MOTHER_ACCESS_CODE_ISSUED"
              : "MOTHER_ACCESS_CODE_REISSUED",
          resourceType: "MOTHER_ACCESS_CREDENTIAL",
          resourceId: outcome.value.id,
          metadata: { reason: input.reason },
        });
      }
      return outcome.value;
    } catch (error) {
      throw mapCredentialError(error);
    }
  }

  public async revoke(
    actor: StaffActor,
    motherId: string,
    input: MotherAccessCredentialMutationRequest,
  ): Promise<MotherAccessCredentialRevokeResponse> {
    const healthCenterId = this.requireManagedCenter(actor);
    const now = this.clock();

    try {
      const outcome = await this.idempotency.runForStaff<MotherAccessCredentialRevokeResponse>(
        {
          actor,
          operation: "MOTHER_ACCESS_CODE_REVOKE",
          idempotencyKey: input.idempotency_key,
          requestIdentity: { mother_id: motherId, ...input },
        },
        async (client) => {
          const mutation = await this.repository.revoke(client, {
            revokedEventId: randomUUID(),
            motherId,
            healthCenterId,
            actorStaffId: actor.staffUserId,
            reason: input.reason,
            occurredAt: now,
          });
          return {
            resourceType: "MOTHER_ACCESS_CREDENTIAL_EVENT",
            resourceId: mutation.mutationId,
            value: mutation.credential,
          };
        },
        async (client, resource) => {
          this.assertResourceType(resource.resourceType);
          const credential = await this.repository.findRevokeMutation(
            client,
            resource.resourceId,
            healthCenterId,
          );
          if (credential === null)
            throw new Error("Credential revocation replay resource is missing");
          return credential;
        },
      );

      if (!outcome.replayed) {
        await this.audit.record({
          actorType: "STAFF",
          actorId: actor.staffUserId,
          action: "MOTHER_ACCESS_CODE_REVOKED",
          resourceType: "MOTHER_ACCESS_CREDENTIAL",
          resourceId: outcome.value.id,
          metadata: { reason: input.reason },
        });
      }
      return outcome.value;
    } catch (error) {
      throw mapCredentialError(error);
    }
  }

  private requireManagedCenter(actor: StaffActor): string {
    this.policy.assertCapability(actor, "MOTHER_REGISTRY_MANAGE");
    if (actor.healthCenterId === null) throw forbidden();
    return actor.healthCenterId;
  }

  private assertResourceType(actual: string): void {
    if (actual !== "MOTHER_ACCESS_CREDENTIAL_EVENT") {
      throw new Error("Unexpected mother access credential idempotency resource type");
    }
  }
}

function mapCredentialError(error: unknown): unknown {
  if (error instanceof MotherAccessTargetUnavailableError || isDatabaseError(error, "23503")) {
    return forbidden();
  }
  if (error instanceof MotherAccessCredentialNotActiveError) {
    return new ApiException({
      status: HttpStatus.CONFLICT,
      code: "MOTHER_ACCESS_CREDENTIAL_NOT_ACTIVE",
      message: "Tidak ada kode akses aktif yang dapat dicabut.",
    });
  }
  if (isDatabaseError(error, "23505")) {
    return new ApiException({
      status: HttpStatus.CONFLICT,
      code: "MOTHER_ACCESS_CREDENTIAL_CONFLICT",
      message: "Perubahan kode akses bertentangan dengan status terbaru.",
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
