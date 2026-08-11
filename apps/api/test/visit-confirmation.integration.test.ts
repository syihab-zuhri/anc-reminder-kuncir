/* eslint-disable @typescript-eslint/require-await -- in-memory ports intentionally satisfy async interfaces */
import "reflect-metadata";
import type { INestApplication } from "@nestjs/common";
import {
  visitConfirmationResponseSchema,
  type FacilityType,
  type MilestoneCode,
  type RequiredFacilityPolicy,
  type VisitConfirmationResponse,
  type VisitStatus,
} from "@anc/contracts";
import type { DatabasePool, IdempotencyResourceReference, TransactionClient } from "@anc/database";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createApiApplication } from "../src/application.js";
import { PasswordHasher } from "../src/auth/password-hasher.js";
import type { StaffActor } from "../src/auth/staff-auth.types.js";
import { ApiException } from "../src/errors/api.exception.js";
import type { IdempotencyService } from "../src/idempotency/idempotency.service.js";
import { JsonLogger } from "../src/observability/json-logger.js";
import {
  VisitConfirmationCodeForbiddenError,
  VisitConfirmationCorrectionRequiredError,
  VisitConfirmationDateBeforePregnancyError,
  VisitConfirmationFacilityNotAllowedError,
  VisitConfirmationFacilityUnavailableError,
  VisitConfirmationInvalidTransitionError,
  VisitConfirmationPregnancyNotActiveError,
  VisitConfirmationTargetUnavailableError,
  type ConfirmVisitInput,
  type VisitConfirmationMutationResult,
  type VisitConfirmationReplayScope,
  type VisitConfirmationRepository,
} from "../src/visit-confirmation/visit-confirmation.repository.js";
import { apiConfigFixture } from "./fixtures.js";
import {
  FakeAuditRepository,
  FakeOrganizationScopeRepository,
  FakeScopedAccessRepository,
  FakeStaffAuthRepository,
} from "./security-fakes.js";

const centerId = "30000000-0000-4000-8000-000000000001";
const puskesmasId = "40000000-0000-4000-8000-000000000001";
const bidanId = "40000000-0000-4000-8000-000000000002";
const milestoneId = "50000000-0000-4000-8000-000000000001";
const pregnancyId = "60000000-0000-4000-8000-000000000001";
const puskesmasFacilityId = "70000000-0000-4000-8000-000000000001";
const midwifeFacilityId = "70000000-0000-4000-8000-000000000002";
const hospitalFacilityId = "70000000-0000-4000-8000-000000000003";
const password = "AmanSekali2026";
const now = new Date("2026-08-11T09:00:00.000Z");

describe("Bidan one-action visit confirmation API", () => {
  let app: INestApplication | undefined;
  let confirmations: FakeVisitConfirmationRepository;
  let audit: FakeAuditRepository;

  beforeEach(async () => {
    const auth = new FakeStaffAuthRepository();
    confirmations = new FakeVisitConfirmationRepository();
    audit = new FakeAuditRepository();
    const passwordHash = await new PasswordHasher().hash(password);
    for (const [id, role, loginIdentifier] of [
      [puskesmasId, "PUSKESMAS", "puskesmas"],
      [bidanId, "BIDAN", "bidan"],
    ] as const) {
      auth.seedUser({
        id,
        healthCenterId: centerId,
        displayName: `${role} DUMMY`,
        role,
        status: "ACTIVE",
        passwordHash,
        loginIdentifier,
        assignments: [],
      });
    }

    app = await createApiApplication({
      config: apiConfigFixture(),
      databasePool: {} as DatabasePool,
      readinessCheck: vi.fn(() =>
        Promise.resolve({ ready: true, checkedAt: now.toISOString(), latencyMs: 1 }),
      ),
      closePool: vi.fn(() => Promise.resolve()),
      logger: new JsonLogger({ service: "test-api", level: "fatal", sink: () => undefined }),
      staffAuthRepository: auth,
      organizationScopeRepository: new FakeOrganizationScopeRepository(),
      scopedAccessRepository: new FakeScopedAccessRepository(),
      visitConfirmationRepository: confirmations,
      auditRepository: audit,
      idempotencyService: new FakeIdempotencyService() as unknown as IdempotencyService,
      clock: () => new Date(now),
    });
    await app.init();
  });

  afterEach(async () => {
    if (app !== undefined) await app.close();
    app = undefined;
  });

  it("confirms K3 without clinical detail and deduplicates same facts by milestone", async () => {
    const token = await login("bidan");
    const firstRequest = confirmationRequest(
      "10000000-0000-4000-8000-000000000001",
      midwifeFacilityId,
    );
    const firstResponse = await confirm(token, firstRequest, 201);
    const first = visitConfirmationResponseSchema.parse(firstResponse.body);
    expect(first).toMatchObject({
      code: "K3",
      visit_status: "CONFIRMED",
      record_validation_status: "INCOMPLETE",
      confirmation_source: "STAFF_WEB",
      confirmed_by_staff_id: bidanId,
    });

    const sameKeyReplay = await confirm(token, firstRequest, 201);
    expect(sameKeyReplay.body).toEqual(firstResponse.body);
    const newKeyDuplicate = await confirm(
      token,
      confirmationRequest("10000000-0000-4000-8000-000000000002", midwifeFacilityId),
      201,
    );
    expect(newKeyDuplicate.body).toEqual(firstResponse.body);
    expect(confirmations.events).toHaveLength(1);
    expect(audit.events.map((event) => event.action)).toEqual([
      "STAFF_LOGIN_SUCCESS",
      "VISIT_CONFIRMED",
    ]);

    const correctionRequired = await confirm(
      token,
      confirmationRequest("10000000-0000-4000-8000-000000000003", puskesmasFacilityId),
      409,
    );
    expect(errorCode(correctionRequired.body as unknown)).toBe(
      "VISIT_CONFIRMATION_CORRECTION_REQUIRED",
    );
  });

  it("enforces Bidan assignment/code limits and Puskesmas inheritance", async () => {
    const bidanToken = await login("bidan");
    confirmations.scopeAllowed = false;
    await confirm(
      bidanToken,
      confirmationRequest("10000000-0000-4000-8000-000000000004", midwifeFacilityId),
      403,
    );

    confirmations.scopeAllowed = true;
    confirmations.code = "K4";
    confirmations.requiredFacilityPolicy = "PUSKESMAS_REQUIRED";
    confirmations.allowedFacilityTypes = ["PUSKESMAS"];
    await confirm(
      bidanToken,
      confirmationRequest("10000000-0000-4000-8000-000000000005", puskesmasFacilityId),
      403,
    );

    const puskesmasToken = await login("puskesmas");
    const response = await confirm(
      puskesmasToken,
      confirmationRequest("10000000-0000-4000-8000-000000000006", puskesmasFacilityId),
      201,
    );
    expect(visitConfirmationResponseSchema.parse(response.body)).toMatchObject({
      code: "K4",
      confirmed_by_staff_id: puskesmasId,
    });
  });

  it("rejects invalid dates, facilities, pregnancy state, and terminal milestones", async () => {
    const token = await login("puskesmas");
    const future = await confirm(
      token,
      {
        ...confirmationRequest("10000000-0000-4000-8000-000000000007", puskesmasFacilityId),
        occurred_on: "2026-08-12",
      },
      422,
    );
    expect(errorCode(future.body as unknown)).toBe("VISIT_OCCURRENCE_DATE_IN_FUTURE");

    const beforePregnancy = await confirm(
      token,
      {
        ...confirmationRequest("10000000-0000-4000-8000-000000000008", puskesmasFacilityId),
        occurred_on: "2026-07-31",
      },
      422,
    );
    expect(errorCode(beforePregnancy.body as unknown)).toBe("VISIT_DATE_BEFORE_PREGNANCY");

    const disallowed = await confirm(
      token,
      confirmationRequest("10000000-0000-4000-8000-000000000009", hospitalFacilityId),
      422,
    );
    expect(errorCode(disallowed.body as unknown)).toBe("FACILITY_NOT_ALLOWED_FOR_MILESTONE");

    confirmations.pregnancyStatus = "CLOSED";
    const closed = await confirm(
      token,
      confirmationRequest("10000000-0000-4000-8000-000000000010", puskesmasFacilityId),
      409,
    );
    expect(errorCode(closed.body as unknown)).toBe("PREGNANCY_NOT_ACTIVE");

    confirmations.pregnancyStatus = "ACTIVE";
    confirmations.visitStatus = "CANCELLED";
    const cancelled = await confirm(
      token,
      confirmationRequest("10000000-0000-4000-8000-000000000011", puskesmasFacilityId),
      409,
    );
    expect(errorCode(cancelled.body as unknown)).toBe("VISIT_CONFIRMATION_INVALID_TRANSITION");
  });

  it("serializes concurrent identical confirmations into one event and audit", async () => {
    const token = await login("bidan");
    const [left, right] = await Promise.all([
      confirm(
        token,
        confirmationRequest("10000000-0000-4000-8000-000000000012", midwifeFacilityId),
      ),
      confirm(
        token,
        confirmationRequest("10000000-0000-4000-8000-000000000013", midwifeFacilityId),
      ),
    ]);

    expect([left.status, right.status]).toEqual([201, 201]);
    expect(left.body).toEqual(right.body);
    expect(confirmations.events).toHaveLength(1);
    expect(audit.events.filter((event) => event.action === "VISIT_CONFIRMED")).toHaveLength(1);
  });

  async function login(identifier: string): Promise<string> {
    const response = await request(server())
      .post("/api/v1/staff/auth/login")
      .send({ login_identifier: identifier, password })
      .expect(200);
    const body = response.body as Readonly<Record<string, unknown>>;
    if (typeof body["access_token"] !== "string") throw new Error("Missing access token");
    return body["access_token"];
  }

  function confirm(
    token: string,
    body: Readonly<Record<string, unknown>>,
    expectedStatus?: number,
  ): request.Test {
    const operation = request(server())
      .post(`/api/v1/milestones/${milestoneId}/confirm`)
      .set("authorization", `Bearer ${token}`)
      .send(body);
    return expectedStatus === undefined ? operation : operation.expect(expectedStatus);
  }

  function server(): Parameters<typeof request>[0] {
    if (app === undefined) throw new Error("Test application is not initialized");
    return app.getHttpServer() as Parameters<typeof request>[0];
  }
});

function confirmationRequest(
  idempotencyKey: string,
  facilityId: string,
): Readonly<Record<string, unknown>> {
  return {
    idempotency_key: idempotencyKey,
    occurred_on: "2026-08-11",
    facility_id: facilityId,
  };
}

function errorCode(body: unknown): unknown {
  if (typeof body !== "object" || body === null || !("error" in body)) return undefined;
  const error = (body as Readonly<Record<string, unknown>>)["error"];
  if (typeof error !== "object" || error === null || !("code" in error)) return undefined;
  return (error as Readonly<Record<string, unknown>>)["code"];
}

class FakeVisitConfirmationRepository implements VisitConfirmationRepository {
  public scopeAllowed = true;
  public code: MilestoneCode = "K3";
  public pregnancyStatus: "ACTIVE" | "CLOSED" = "ACTIVE";
  public visitStatus: VisitStatus = "DUE";
  public requiredFacilityPolicy: RequiredFacilityPolicy = "FLEXIBLE";
  public allowedFacilityTypes: FacilityType[] = ["PUSKESMAS", "MIDWIFE_PRACTICE"];
  public readonly events: VisitConfirmationResponse[] = [];
  private queue: Promise<void> = Promise.resolve();
  private readonly facilities = new Map<string, FacilityType>([
    [puskesmasFacilityId, "PUSKESMAS"],
    [midwifeFacilityId, "MIDWIFE_PRACTICE"],
    [hospitalFacilityId, "HOSPITAL"],
  ]);

  public confirm(
    client: TransactionClient,
    input: ConfirmVisitInput,
  ): Promise<VisitConfirmationMutationResult> {
    void client;
    return this.withLock(async () => {
      if (input.milestoneId !== milestoneId || !this.scopeAllowed) {
        throw new VisitConfirmationTargetUnavailableError();
      }
      if (
        input.actorRole !== "PUSKESMAS" &&
        (input.actorRole !== "BIDAN" || !["K2", "K3", "K6", "K7"].includes(this.code))
      ) {
        throw new VisitConfirmationCodeForbiddenError();
      }
      if (this.pregnancyStatus !== "ACTIVE") {
        throw new VisitConfirmationPregnancyNotActiveError();
      }
      const existing = this.events[0];
      if (this.visitStatus === "CONFIRMED" && existing !== undefined) {
        if (
          existing.occurred_on !== input.occurredOn ||
          existing.facility_id !== input.facilityId
        ) {
          throw new VisitConfirmationCorrectionRequiredError();
        }
        return { created: false, confirmation: existing };
      }
      if (this.visitStatus === "CANCELLED" || this.visitStatus === "NOT_APPLICABLE") {
        throw new VisitConfirmationInvalidTransitionError();
      }
      if (input.occurredOn < "2026-08-01") {
        throw new VisitConfirmationDateBeforePregnancyError();
      }
      const facilityType = this.facilities.get(input.facilityId);
      if (facilityType === undefined) throw new VisitConfirmationFacilityUnavailableError();
      if (!this.allowedFacilityTypes.includes(facilityType)) {
        throw new VisitConfirmationFacilityNotAllowedError();
      }
      if (this.requiredFacilityPolicy === "PUSKESMAS_REQUIRED" && facilityType !== "PUSKESMAS") {
        throw new VisitConfirmationFacilityNotAllowedError();
      }
      const confirmation: VisitConfirmationResponse = {
        id: input.confirmationId,
        milestone_id: input.milestoneId,
        pregnancy_id: pregnancyId,
        code: this.code,
        visit_status: "CONFIRMED",
        record_validation_status: "INCOMPLETE",
        occurred_on: input.occurredOn,
        facility_id: input.facilityId,
        confirmation_source: "STAFF_WEB",
        confirmed_by_staff_id: input.actorStaffId,
        confirmed_at: input.confirmedAt.toISOString(),
      };
      this.events.push(confirmation);
      this.visitStatus = "CONFIRMED";
      return { created: true, confirmation };
    });
  }

  public async findConfirmationMutation(
    client: TransactionClient,
    confirmationId: string,
    scope: VisitConfirmationReplayScope,
  ): Promise<VisitConfirmationResponse | null> {
    void client;
    if (!this.scopeAllowed || scope.healthCenterId !== centerId) return null;
    return this.events.find((event) => event.id === confirmationId) ?? null;
  }

  private async withLock<T>(operation: () => Promise<T>): Promise<T> {
    const previous = this.queue;
    let release = (): void => undefined;
    this.queue = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      return await operation();
    } finally {
      release();
    }
  }
}

class FakeIdempotencyService {
  private readonly outcomes = new Map<
    string,
    { readonly resource: IdempotencyResourceReference; readonly identity: string }
  >();

  public async runForStaff<T>(
    input: {
      readonly actor: StaffActor;
      readonly operation: string;
      readonly idempotencyKey: string;
      readonly requestIdentity: unknown;
    },
    execute: (client: TransactionClient) => Promise<{
      readonly resourceType: string;
      readonly resourceId: string;
      readonly value: T;
    }>,
    replay: (client: TransactionClient, resource: IdempotencyResourceReference) => Promise<T>,
  ): Promise<{
    readonly resourceType: string;
    readonly resourceId: string;
    readonly replayed: boolean;
    readonly value: T;
  }> {
    const key = `${input.actor.staffUserId}:${input.operation}:${input.idempotencyKey}`;
    const identity = JSON.stringify(input.requestIdentity);
    const existing = this.outcomes.get(key);
    const client = {} as TransactionClient;
    if (existing !== undefined) {
      if (existing.identity !== identity) {
        throw new ApiException({
          status: 409,
          code: "IDEMPOTENCY_KEY_REUSED",
          message: "Kunci idempotensi telah digunakan untuk permintaan yang berbeda.",
        });
      }
      return {
        ...existing.resource,
        replayed: true,
        value: await replay(client, existing.resource),
      };
    }
    const executed = await execute(client);
    const resource = { resourceType: executed.resourceType, resourceId: executed.resourceId };
    this.outcomes.set(key, { resource, identity });
    return { ...resource, replayed: false, value: executed.value };
  }
}
