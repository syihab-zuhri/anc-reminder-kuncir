import { randomUUID } from "node:crypto";
import { HttpStatus, Inject, Injectable } from "@nestjs/common";
import type { ApiConfig } from "@anc/config";
import type {
  MotherRecordArchiveRequest,
  MotherRecordArchiveResponse,
  MotherRecordUpdateRequest,
  MotherRecordUpdateResponse,
  MotherRegistrationRequest,
  MotherRegistrationResponse,
} from "@anc/contracts";

import type { AuditService } from "../audit/audit.service.js";
import type { StaffActor } from "../auth/staff-auth.types.js";
import type { Clock } from "../auth/staff-auth.service.js";
import { AuthorizationPolicy, forbidden } from "../authorization/authorization.policy.js";
import { ApiException } from "../errors/api.exception.js";
import { IdempotencyService } from "../idempotency/idempotency.service.js";
import {
  API_CONFIG,
  AUDIT_SERVICE,
  CLOCK,
  IDEMPOTENCY_SERVICE,
  MOTHER_REGISTRY_REPOSITORY,
} from "../infrastructure/tokens.js";
import {
  ActiveAncPlanInvalidError,
  ActiveAncPlanUnavailableError,
  MotherRecordHasActivePregnancyError,
  MotherRecordUnavailableError,
  type MotherRegistryRepository,
} from "./mother-registry.repository.js";
import { NikCipher } from "./nik-cipher.js";
import { assertPregnancyStartDateNotFuture } from "./registry-validation.js";

@Injectable()
export class MotherRegistryService {
  public constructor(
    @Inject(MOTHER_REGISTRY_REPOSITORY) private readonly repository: MotherRegistryRepository,
    @Inject(AUDIT_SERVICE) private readonly audit: AuditService,
    @Inject(IDEMPOTENCY_SERVICE) private readonly idempotency: IdempotencyService,
    @Inject(API_CONFIG) private readonly config: ApiConfig,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly policy: AuthorizationPolicy,
    private readonly nikCipher: NikCipher,
  ) {}

  public async register(
    actor: StaffActor,
    input: MotherRegistrationRequest,
  ): Promise<MotherRegistrationResponse> {
    this.policy.assertCapability(actor, "MOTHER_REGISTRY_MANAGE");
    const healthCenterId = actor.healthCenterId;
    if (healthCenterId === null) throw forbidden();

    const now = this.clock();
    assertPregnancyStartDateNotFuture(input.pregnancy_start_date, now, this.config.primaryTimezone);

    const phoneNormalized = normalizeIndonesianPhone(input.phone_number);
    const nikCiphertext = this.nikCipher.encrypt(input.nik);

    try {
      const outcome = await this.idempotency.runForStaff(
        {
          actor,
          operation: "MOTHER_REGISTRATION",
          idempotencyKey: input.idempotency_key,
          requestIdentity: input,
        },
        async (client) => {
          const registration = await this.repository.create(client, {
            motherId: randomUUID(),
            pregnancyId: randomUUID(),
            consentId: randomUUID(),
            healthCenterId,
            fullName: input.full_name,
            nikCiphertext,
            address: input.address,
            phoneNormalized,
            pregnancyStartDate: input.pregnancy_start_date,
            notificationAllowed: input.consent.notification_allowed,
            recordedAt: now,
          });
          return {
            resourceType: "MOTHER",
            resourceId: registration.mother.id,
            value: registration,
          };
        },
        async (client, resource) => {
          if (resource.resourceType !== "MOTHER") {
            throw new Error("Unexpected idempotency resource type for mother registration");
          }
          const registration = await this.repository.findRegistration(client, resource.resourceId);
          if (registration === null)
            throw new Error("Idempotency registration resource is missing");
          return registration;
        },
      );

      if (!outcome.replayed) {
        await this.recordRegistrationAudit(actor, outcome.value);
      }
      return outcome.value;
    } catch (error) {
      if (
        error instanceof ActiveAncPlanUnavailableError ||
        error instanceof ActiveAncPlanInvalidError
      ) {
        throw new ApiException({
          status: HttpStatus.CONFLICT,
          code: "REGISTRATION_NOT_READY",
          message: "Registrasi belum siap karena rencana ANC aktif belum tersedia.",
        });
      }
      if (isDatabaseError(error, "23505")) {
        throw new ApiException({
          status: HttpStatus.CONFLICT,
          code: "REGISTRATION_CONFLICT",
          message: "Registrasi bertentangan dengan data aktif yang ada.",
        });
      }
      throw error;
    }
  }

  public async update(
    actor: StaffActor,
    motherId: string,
    input: MotherRecordUpdateRequest,
  ): Promise<MotherRecordUpdateResponse> {
    const healthCenterId = this.requireManagedCenter(actor);
    try {
      const outcome = await this.idempotency.runForStaff(
        {
          actor,
          operation: "MOTHER_RECORD_UPDATE",
          idempotencyKey: input.idempotency_key,
          requestIdentity: { mother_id: motherId, ...input },
        },
        async (client) => {
          const record = await this.repository.updateRecord(client, {
            motherId,
            healthCenterId,
            fullName: input.full_name,
            address: input.address,
            phoneNormalized:
              input.phone_number === undefined
                ? null
                : normalizeIndonesianPhone(input.phone_number),
          });
          return { resourceType: "MOTHER", resourceId: record.id, value: record };
        },
        async (client, resource) => {
          this.assertResourceType(resource.resourceType, "MOTHER");
          const record = await this.repository.findRecordUpdate(
            client,
            resource.resourceId,
            healthCenterId,
          );
          if (record === null) throw new Error("Idempotency update resource is missing");
          return record;
        },
      );
      if (!outcome.replayed) {
        await this.audit.record({
          actorType: "STAFF",
          actorId: actor.staffUserId,
          action: "MOTHER_RECORD_UPDATED",
          resourceType: "MOTHER",
          resourceId: outcome.value.id,
          metadata: { reason: input.reason },
        });
      }
      return outcome.value;
    } catch (error) {
      throw mapMotherRecordError(error);
    }
  }

  public async archive(
    actor: StaffActor,
    motherId: string,
    input: MotherRecordArchiveRequest,
  ): Promise<MotherRecordArchiveResponse> {
    this.policy.assertCapability(actor, "MOTHER_RECORD_ARCHIVE");
    const healthCenterId = actor.healthCenterId;
    if (healthCenterId === null) throw forbidden();
    try {
      const outcome = await this.idempotency.runForStaff(
        {
          actor,
          operation: "MOTHER_RECORD_ARCHIVE",
          idempotencyKey: input.idempotency_key,
          requestIdentity: { mother_id: motherId, ...input },
        },
        async (client) => {
          const record = await this.repository.archiveRecord(client, {
            motherId,
            healthCenterId,
            actorStaffUserId: actor.staffUserId,
            reason: input.reason,
            archivedAt: this.clock(),
          });
          return { resourceType: "MOTHER", resourceId: record.id, value: record };
        },
        async (client, resource) => {
          this.assertResourceType(resource.resourceType, "MOTHER");
          const record = await this.repository.findArchivedRecord(
            client,
            resource.resourceId,
            healthCenterId,
          );
          if (record === null) throw new Error("Idempotency archive resource is missing");
          return record;
        },
      );
      if (!outcome.replayed) {
        await this.audit.record({
          actorType: "STAFF",
          actorId: actor.staffUserId,
          action: "MOTHER_RECORD_ARCHIVED",
          resourceType: "MOTHER",
          resourceId: outcome.value.id,
          metadata: { reason: input.reason },
        });
      }
      return outcome.value;
    } catch (error) {
      throw mapMotherRecordError(error);
    }
  }

  private requireManagedCenter(actor: StaffActor): string {
    this.policy.assertCapability(actor, "MOTHER_REGISTRY_MANAGE");
    if (actor.healthCenterId === null) throw forbidden();
    return actor.healthCenterId;
  }

  private assertResourceType(actual: string, expected: string): void {
    if (actual !== expected) throw new Error("Unexpected idempotency resource type");
  }

  private async recordRegistrationAudit(
    actor: StaffActor,
    registration: MotherRegistrationResponse,
  ): Promise<void> {
    await this.audit.record({
      actorType: "STAFF",
      actorId: actor.staffUserId,
      action: "MOTHER_REGISTERED",
      resourceType: "MOTHER",
      resourceId: registration.mother.id,
    });
    await this.audit.record({
      actorType: "STAFF",
      actorId: actor.staffUserId,
      action: "PREGNANCY_CREATED",
      resourceType: "PREGNANCY",
      resourceId: registration.pregnancy.id,
    });
    await this.audit.record({
      actorType: "STAFF",
      actorId: actor.staffUserId,
      action: "CONSENT_RECORDED",
      resourceType: "CONSENT_RECORD",
      resourceId: registration.consent.id,
    });
  }
}

function mapMotherRecordError(error: unknown): unknown {
  if (error instanceof MotherRecordUnavailableError) {
    return new ApiException({
      status: HttpStatus.NOT_FOUND,
      code: "MOTHER_NOT_FOUND",
      message: "Data Ibu Hamil tidak ditemukan atau sudah diarsipkan.",
    });
  }
  if (error instanceof MotherRecordHasActivePregnancyError) {
    return new ApiException({
      status: HttpStatus.CONFLICT,
      code: "MOTHER_ARCHIVE_ACTIVE_PREGNANCY",
      message: "Kehamilan aktif harus ditutup sebelum data Ibu Hamil diarsipkan.",
    });
  }
  return error;
}

export function normalizeIndonesianPhone(value: string): string {
  const compact = value.normalize("NFKC").replace(/[\s().-]/gu, "");
  const normalized = compact.startsWith("0")
    ? `62${compact.slice(1)}`
    : compact.startsWith("+62")
      ? compact.slice(1)
      : compact;
  if (!/^628\d{7,12}$/u.test(normalized)) {
    throw new ApiException({
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      code: "INVALID_PHONE_NUMBER",
      message: "Nomor telepon Indonesia tidak valid.",
      fields: { phone_number: "must be an Indonesian mobile number" },
    });
  }
  return normalized;
}

function isDatabaseError(error: unknown, code: string): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { readonly code?: unknown }).code === code
  );
}
