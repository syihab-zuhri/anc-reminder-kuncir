import { randomUUID } from "node:crypto";
import { HttpStatus, Inject, Injectable } from "@nestjs/common";
import type { ApiConfig } from "@anc/config";
import type { MotherRegistrationRequest, MotherRegistrationResponse } from "@anc/contracts";

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
  ActiveAncPlanUnavailableError,
  type MotherRegistryRepository,
} from "./mother-registry.repository.js";
import { NikCipher } from "./nik-cipher.js";

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
    if (input.pregnancy_start_date > dateOnlyInTimezone(now, this.config.primaryTimezone)) {
      throw new ApiException({
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        code: "INVALID_PREGNANCY_START_DATE",
        message: "Tanggal awal kehamilan tidak boleh berada di masa depan.",
        fields: { pregnancy_start_date: "must not be in the future" },
      });
    }

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
      if (error instanceof ActiveAncPlanUnavailableError) {
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

function dateOnlyInTimezone(date: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = new Map(parts.map((part) => [part.type, part.value]));
  return `${values.get("year")}-${values.get("month")}-${values.get("day")}`;
}

function isDatabaseError(error: unknown, code: string): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { readonly code?: unknown }).code === code
  );
}
