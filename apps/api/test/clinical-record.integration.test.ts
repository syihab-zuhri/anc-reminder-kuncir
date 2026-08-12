/* eslint-disable @typescript-eslint/require-await -- in-memory ports intentionally satisfy async interfaces */
import "reflect-metadata";
import type { INestApplication } from "@nestjs/common";
import {
  clinicalRecordResponseSchema,
  type ClinicalRecordResponse,
  type K1K6MilestoneCode,
  type VisitStatus,
} from "@anc/contracts";
import type { DatabasePool, IdempotencyResourceReference, TransactionClient } from "@anc/database";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createApiApplication } from "../src/application.js";
import { PasswordHasher } from "../src/auth/password-hasher.js";
import type { StaffActor } from "../src/auth/staff-auth.types.js";
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
  type ChangeClinicalRecordValidationInput,
  type ClinicalRecordMutationResult,
  type ClinicalRecordRepository,
  type SaveClinicalRecordInput,
} from "../src/clinical-record/clinical-record.repository.js";
import { ApiException } from "../src/errors/api.exception.js";
import type { IdempotencyService } from "../src/idempotency/idempotency.service.js";
import { JsonLogger } from "../src/observability/json-logger.js";
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
const password = "AmanSekali2026";
const now = new Date("2026-08-12T02:00:00.000Z");

describe("Puskesmas K1-K6 clinical record API", () => {
  let app: INestApplication | undefined;
  let records: FakeClinicalRecordRepository;
  let audit: FakeAuditRepository;

  beforeEach(async () => {
    const auth = new FakeStaffAuthRepository();
    records = new FakeClinicalRecordRepository();
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
      clinicalRecordRepository: records,
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

  it("saves, replays, and reads a versioned detail without caching it", async () => {
    const token = await login("puskesmas");
    const missing = await getRecord(token, 404);
    expect(errorCode(missing.body as unknown)).toBe("CLINICAL_RECORD_NOT_FOUND");

    const input = saveRequest("10000000-0000-4000-8000-000000000001", null, "FIRST");
    const firstResponse = await saveRecord(token, input, 200);
    expect(firstResponse.headers["cache-control"]).toBe("no-store");
    const first = clinicalRecordResponseSchema.parse(firstResponse.body);
    expect(first).toMatchObject({
      code: "K3",
      revision_no: 1,
      schema_version: "synthetic.k3.v1",
      record_validation_status: "INCOMPLETE",
      validated_at: null,
      validated_by_staff_id: null,
    });

    const replay = await saveRecord(token, input, 200);
    expect(replay.body).toEqual(firstResponse.body);
    const current = await getRecord(token, 200);
    expect(current.body).toEqual(firstResponse.body);
    expect(records.revisions).toHaveLength(1);
    expect(audit.events.filter((event) => event.action === "K1_K6_RECORD_SAVED")).toHaveLength(1);
  });

  it("denies Bidan and unsupported/out-of-scope milestones without leaking detail", async () => {
    const bidanToken = await login("bidan");
    await getRecord(bidanToken, 403);
    await saveRecord(
      bidanToken,
      saveRequest("10000000-0000-4000-8000-000000000002", null, "DENIED"),
      403,
    );
    await validateRecord(
      bidanToken,
      validationRequest("10000000-0000-4000-8000-000000000003", crypto.randomUUID()),
      403,
    );
    expect(records.revisions).toHaveLength(0);

    const puskesmasToken = await login("puskesmas");
    records.targetAvailable = false;
    await getRecord(puskesmasToken, 403);
    await saveRecord(
      puskesmasToken,
      saveRequest("10000000-0000-4000-8000-000000000004", null, "K7-DENIED"),
      403,
    );
  });

  it("validates only a confirmed visit, requires reopen before edit, and deduplicates state changes", async () => {
    const token = await login("puskesmas");
    const saved = clinicalRecordResponseSchema.parse(
      (
        await saveRecord(
          token,
          saveRequest("10000000-0000-4000-8000-000000000005", null, "DRAFT"),
          200,
        )
      ).body,
    );
    const validateInput = validationRequest(
      "10000000-0000-4000-8000-000000000006",
      saved.revision_id,
    );
    const unconfirmed = await validateRecord(token, validateInput, 409);
    expect(errorCode(unconfirmed.body as unknown)).toBe("VISIT_CONFIRMATION_REQUIRED");

    records.visitStatus = "CONFIRMED";
    const validatedResponse = await validateRecord(token, validateInput, 201);
    const validated = clinicalRecordResponseSchema.parse(validatedResponse.body);
    expect(validated).toMatchObject({
      revision_id: saved.revision_id,
      record_validation_status: "VALIDATED",
      validated_by_staff_id: puskesmasId,
    });
    const validationReplay = await validateRecord(token, validateInput, 201);
    expect(validationReplay.body as unknown).toEqual(validatedResponse.body as unknown);
    const logicalValidationDuplicate = await validateRecord(
      token,
      validationRequest("10000000-0000-4000-8000-000000000007", saved.revision_id),
      201,
    );
    expect(logicalValidationDuplicate.body as unknown).toEqual(validatedResponse.body as unknown);

    const editDenied = await saveRecord(
      token,
      saveRequest("10000000-0000-4000-8000-000000000008", saved.revision_id, "EDIT"),
      409,
    );
    expect(errorCode(editDenied.body as unknown)).toBe("CLINICAL_RECORD_REOPEN_REQUIRED");

    const reopenInput = reopenRequest(
      "10000000-0000-4000-8000-000000000009",
      saved.revision_id,
      "Perlu melengkapi data sintetis",
    );
    const reopenedResponse = await reopenRecord(token, reopenInput, 201);
    expect(reopenedResponse.body).toMatchObject({ record_validation_status: "INCOMPLETE" });
    const reopenReplay = await reopenRecord(token, reopenInput, 201);
    expect(reopenReplay.body as unknown).toEqual(reopenedResponse.body as unknown);
    const logicalReopenDuplicate = await reopenRecord(
      token,
      reopenRequest(
        "10000000-0000-4000-8000-000000000010",
        saved.revision_id,
        "Perlu melengkapi data sintetis",
      ),
      201,
    );
    expect(logicalReopenDuplicate.body as unknown).toEqual(reopenedResponse.body as unknown);

    const second = clinicalRecordResponseSchema.parse(
      (
        await saveRecord(
          token,
          saveRequest("10000000-0000-4000-8000-000000000011", saved.revision_id, "REVISED"),
          200,
        )
      ).body,
    );
    expect(second).toMatchObject({ revision_no: 2, record_validation_status: "INCOMPLETE" });
    expect(records.validationEvents).toHaveLength(2);
    expect(audit.events.filter((event) => event.action === "RECORD_VALIDATED")).toHaveLength(1);
    expect(audit.events.filter((event) => event.action === "RECORD_REOPENED")).toHaveLength(1);
  });

  it("allows one of two concurrent writers from the same expected revision", async () => {
    const token = await login("puskesmas");
    const first = clinicalRecordResponseSchema.parse(
      (
        await saveRecord(
          token,
          saveRequest("10000000-0000-4000-8000-000000000012", null, "INITIAL"),
          200,
        )
      ).body,
    );
    const [left, right] = await Promise.all([
      saveRecord(
        token,
        saveRequest("10000000-0000-4000-8000-000000000013", first.revision_id, "LEFT"),
      ),
      saveRecord(
        token,
        saveRequest("10000000-0000-4000-8000-000000000014", first.revision_id, "RIGHT"),
      ),
    ]);
    expect([left.status, right.status].sort()).toEqual([200, 409]);
    expect(records.revisions).toHaveLength(2);
    expect(audit.events.filter((event) => event.action === "K1_K6_RECORD_SAVED")).toHaveLength(2);
  });

  it("rejects closed pregnancy, terminal milestones, and validation without a record", async () => {
    const token = await login("puskesmas");
    records.pregnancyStatus = "CLOSED";
    expect(
      errorCode(
        (
          await saveRecord(
            token,
            saveRequest("10000000-0000-4000-8000-000000000015", null, "CLOSED"),
            409,
          )
        ).body as unknown,
      ),
    ).toBe("PREGNANCY_NOT_ACTIVE");

    records.pregnancyStatus = "ACTIVE";
    records.visitStatus = "CANCELLED";
    expect(
      errorCode(
        (
          await saveRecord(
            token,
            saveRequest("10000000-0000-4000-8000-000000000016", null, "TERMINAL"),
            409,
          )
        ).body as unknown,
      ),
    ).toBe("CLINICAL_RECORD_MILESTONE_TERMINAL");

    records.visitStatus = "CONFIRMED";
    expect(
      errorCode(
        (
          await validateRecord(
            token,
            validationRequest(
              "10000000-0000-4000-8000-000000000017",
              "20000000-0000-4000-8000-000000000017",
            ),
            404,
          )
        ).body as unknown,
      ),
    ).toBe("CLINICAL_RECORD_NOT_FOUND");
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

  function getRecord(token: string, expectedStatus?: number): request.Test {
    const operation = request(server())
      .get(`/api/v1/milestones/${milestoneId}/record`)
      .set("authorization", `Bearer ${token}`);
    return expectedStatus === undefined ? operation : operation.expect(expectedStatus);
  }

  function saveRecord(
    token: string,
    body: Readonly<Record<string, unknown>>,
    expectedStatus?: number,
  ): request.Test {
    const operation = request(server())
      .put(`/api/v1/milestones/${milestoneId}/record`)
      .set("authorization", `Bearer ${token}`)
      .send(body);
    return expectedStatus === undefined ? operation : operation.expect(expectedStatus);
  }

  function validateRecord(
    token: string,
    body: Readonly<Record<string, unknown>>,
    expectedStatus?: number,
  ): request.Test {
    const operation = request(server())
      .post(`/api/v1/milestones/${milestoneId}/record/validate`)
      .set("authorization", `Bearer ${token}`)
      .send(body);
    return expectedStatus === undefined ? operation : operation.expect(expectedStatus);
  }

  function reopenRecord(
    token: string,
    body: Readonly<Record<string, unknown>>,
    expectedStatus?: number,
  ): request.Test {
    const operation = request(server())
      .post(`/api/v1/milestones/${milestoneId}/record/reopen`)
      .set("authorization", `Bearer ${token}`)
      .send(body);
    return expectedStatus === undefined ? operation : operation.expect(expectedStatus);
  }

  function server(): Parameters<typeof request>[0] {
    if (app === undefined) throw new Error("Test application is not initialized");
    return app.getHttpServer() as Parameters<typeof request>[0];
  }
});

function saveRequest(
  idempotencyKey: string,
  expectedRevisionId: string | null,
  value: string,
): Readonly<Record<string, unknown>> {
  return {
    idempotency_key: idempotencyKey,
    expected_revision_id: expectedRevisionId,
    schema_version: "synthetic.k3.v1",
    record_payload: { synthetic_component: { state: "RECORDED", value } },
  };
}

function validationRequest(
  idempotencyKey: string,
  expectedRevisionId: string,
): Readonly<Record<string, unknown>> {
  return {
    idempotency_key: idempotencyKey,
    expected_revision_id: expectedRevisionId,
    attestation: "DETAIL_REVIEWED_COMPLETE",
  };
}

function reopenRequest(
  idempotencyKey: string,
  expectedRevisionId: string,
  reason: string,
): Readonly<Record<string, unknown>> {
  return { idempotency_key: idempotencyKey, expected_revision_id: expectedRevisionId, reason };
}

function errorCode(body: unknown): unknown {
  if (typeof body !== "object" || body === null || !("error" in body)) return undefined;
  const error = (body as Readonly<Record<string, unknown>>)["error"];
  if (typeof error !== "object" || error === null || !("code" in error)) return undefined;
  return (error as Readonly<Record<string, unknown>>)["code"];
}

class FakeClinicalRecordRepository implements ClinicalRecordRepository {
  public targetAvailable = true;
  public pregnancyStatus: "ACTIVE" | "CLOSED" = "ACTIVE";
  public visitStatus: VisitStatus = "DUE";
  public code: K1K6MilestoneCode = "K3";
  public current: ClinicalRecordResponse | null = null;
  public readonly revisions: ClinicalRecordResponse[] = [];
  public readonly validationEvents: Array<{
    readonly id: string;
    readonly action: "VALIDATE" | "REOPEN";
    readonly reason: string | null;
    readonly record: ClinicalRecordResponse;
  }> = [];
  private queue: Promise<void> = Promise.resolve();

  public async findCurrentRecord(
    targetMilestoneId: string,
    healthCenterId: string,
  ): Promise<ClinicalRecordResponse | null> {
    this.assertTarget(targetMilestoneId, healthCenterId);
    return this.current;
  }

  public save(
    client: TransactionClient,
    input: SaveClinicalRecordInput,
  ): Promise<ClinicalRecordMutationResult> {
    void client;
    return this.withLock(async () => {
      this.assertMutationTarget(input.milestoneId, input.healthCenterId);
      if (this.current === null) {
        if (input.expectedRevisionId !== null) throw new ClinicalRecordRevisionChangedError();
      } else {
        if (this.current.revision_id !== input.expectedRevisionId) {
          throw new ClinicalRecordRevisionChangedError();
        }
        if (this.current.record_validation_status === "VALIDATED") {
          throw new ClinicalRecordReopenRequiredError();
        }
      }
      const record: ClinicalRecordResponse = {
        record_id: this.current?.record_id ?? input.recordId,
        milestone_id: milestoneId,
        pregnancy_id: pregnancyId,
        code: this.code,
        revision_id: input.revisionId,
        revision_no: (this.current?.revision_no ?? 0) + 1,
        schema_version: input.schemaVersion,
        record_payload: input.recordPayload,
        record_validation_status: "INCOMPLETE",
        validated_at: null,
        validated_by_staff_id: null,
      };
      this.current = record;
      this.revisions.push(record);
      return { created: true, mutationId: input.revisionId, record };
    });
  }

  public async findSaveMutation(
    client: TransactionClient,
    revisionId: string,
    healthCenterId: string,
  ): Promise<ClinicalRecordResponse | null> {
    void client;
    this.assertTarget(milestoneId, healthCenterId);
    return this.revisions.find((record) => record.revision_id === revisionId) ?? null;
  }

  public validate(
    client: TransactionClient,
    input: ChangeClinicalRecordValidationInput,
  ): Promise<ClinicalRecordMutationResult> {
    void client;
    return this.withLock(async () => {
      this.assertMutationTarget(input.milestoneId, input.healthCenterId);
      if (this.visitStatus !== "CONFIRMED") throw new ClinicalRecordVisitNotConfirmedError();
      const current = this.requireCurrent(input.expectedRevisionId);
      if (current.record_validation_status === "VALIDATED") {
        const duplicate = this.findLatestEvent("VALIDATE", input.expectedRevisionId);
        if (duplicate === undefined) throw new ClinicalRecordHistoryMissingError();
        return { created: false, mutationId: duplicate.id, record: duplicate.record };
      }
      const record: ClinicalRecordResponse = {
        ...current,
        record_validation_status: "VALIDATED",
        validated_at: input.occurredAt.toISOString(),
        validated_by_staff_id: input.actorStaffId,
      };
      this.current = record;
      this.validationEvents.push({
        id: input.eventId,
        action: "VALIDATE",
        reason: null,
        record,
      });
      return { created: true, mutationId: input.eventId, record };
    });
  }

  public reopen(
    client: TransactionClient,
    input: ChangeClinicalRecordValidationInput,
  ): Promise<ClinicalRecordMutationResult> {
    void client;
    return this.withLock(async () => {
      this.assertMutationTarget(input.milestoneId, input.healthCenterId);
      if (this.visitStatus !== "CONFIRMED") throw new ClinicalRecordVisitNotConfirmedError();
      const current = this.requireCurrent(input.expectedRevisionId);
      if (current.record_validation_status === "INCOMPLETE") {
        const duplicate = this.findLatestEvent("REOPEN", input.expectedRevisionId);
        if (duplicate !== undefined && duplicate.reason === input.reason) {
          return { created: false, mutationId: duplicate.id, record: duplicate.record };
        }
        throw new ClinicalRecordAlreadyIncompleteError();
      }
      const record: ClinicalRecordResponse = {
        ...current,
        record_validation_status: "INCOMPLETE",
        validated_at: null,
        validated_by_staff_id: null,
      };
      this.current = record;
      this.validationEvents.push({
        id: input.eventId,
        action: "REOPEN",
        reason: input.reason,
        record,
      });
      return { created: true, mutationId: input.eventId, record };
    });
  }

  public async findValidationMutation(
    client: TransactionClient,
    eventId: string,
    healthCenterId: string,
  ): Promise<ClinicalRecordResponse | null> {
    void client;
    this.assertTarget(milestoneId, healthCenterId);
    return this.validationEvents.find((event) => event.id === eventId)?.record ?? null;
  }

  private assertTarget(targetMilestoneId: string, healthCenterId: string): void {
    if (!this.targetAvailable || targetMilestoneId !== milestoneId || healthCenterId !== centerId) {
      throw new ClinicalRecordTargetUnavailableError();
    }
  }

  private assertMutationTarget(targetMilestoneId: string, healthCenterId: string): void {
    this.assertTarget(targetMilestoneId, healthCenterId);
    if (this.pregnancyStatus !== "ACTIVE") throw new ClinicalRecordPregnancyNotActiveError();
    if (this.visitStatus === "CANCELLED" || this.visitStatus === "NOT_APPLICABLE") {
      throw new ClinicalRecordMilestoneTerminalError();
    }
  }

  private requireCurrent(expectedRevisionId: string): ClinicalRecordResponse {
    if (this.current === null) throw new ClinicalRecordNotFoundError();
    if (this.current.revision_id !== expectedRevisionId) {
      throw new ClinicalRecordRevisionChangedError();
    }
    return this.current;
  }

  private findLatestEvent(action: "VALIDATE" | "REOPEN", revisionId: string) {
    return [...this.validationEvents]
      .reverse()
      .find((event) => event.action === action && event.record.revision_id === revisionId);
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
