/* eslint-disable @typescript-eslint/require-await -- test doubles intentionally satisfy async ports */
import "reflect-metadata";
import type { INestApplication } from "@nestjs/common";
import { pregnancyLifecycleResponseSchema, type PregnancyLifecycleResponse } from "@anc/contracts";
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
  ActivePregnancyExistsError,
  PregnancyDatingUnchangedError,
  PregnancyNotActiveError,
  PregnancyTargetUnavailableError,
  type ClosePregnancyInput,
  type CreatePregnancyInput,
  type PregnancyLifecycleAction,
  type PregnancyLifecycleRepository,
  type PregnancyMutationResult,
  type RevisePregnancyDatingInput,
} from "../src/registry/pregnancy-lifecycle.repository.js";
import { apiConfigFixture } from "./fixtures.js";
import {
  FakeAuditRepository,
  FakeOrganizationScopeRepository,
  FakeScopedAccessRepository,
  FakeStaffAuthRepository,
} from "./security-fakes.js";

const centerId = "30000000-0000-4000-8000-000000000001";
const otherCenterId = "30000000-0000-4000-8000-000000000002";
const motherId = "50000000-0000-4000-8000-000000000001";
const otherMotherId = "50000000-0000-4000-8000-000000000002";
const pregnancyId = "60000000-0000-4000-8000-000000000001";
const puskesmasId = "40000000-0000-4000-8000-000000000001";
const bidanId = "40000000-0000-4000-8000-000000000002";
const password = "AmanSekali2026";
const now = new Date("2026-08-10T09:00:00.000Z");

describe("pregnancy lifecycle API", () => {
  let app: INestApplication | undefined;
  let lifecycle: FakePregnancyLifecycleRepository;
  let audit: FakeAuditRepository;

  beforeEach(async () => {
    const auth = new FakeStaffAuthRepository();
    lifecycle = new FakePregnancyLifecycleRepository();
    audit = new FakeAuditRepository();
    lifecycle.seedMother(motherId, centerId);
    lifecycle.seedMother(otherMotherId, otherCenterId);
    lifecycle.seedPregnancy({
      id: pregnancyId,
      mother_id: motherId,
      health_center_id: centerId,
      dating_basis: "PREGNANCY_START_DATE",
      dating_date: "2026-05-01",
      status: "ACTIVE",
      closed_at: null,
    });

    const passwordHash = await new PasswordHasher().hash(password);
    for (const [id, role, loginIdentifier] of [
      [puskesmasId, "PUSKESMAS", "puskesmas"],
      [bidanId, "BIDAN", "bidan"],
    ] as const) {
      auth.seedUser({
        id,
        healthCenterId: centerId,
        displayName: role,
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
      pregnancyLifecycleRepository: lifecycle,
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

  it("records one dating revision, closes once, then permits one new active pregnancy", async () => {
    const token = await login("puskesmas");
    const revisionRequest = {
      idempotency_key: "8b26fdbd-6306-4bbf-9765-3fd620888e7c",
      pregnancy_start_date: "2026-04-28",
      reason: "Koreksi input awal",
    };
    const revisedResponse = await request(server())
      .patch(`/api/v1/pregnancies/${pregnancyId}`)
      .set("authorization", `Bearer ${token}`)
      .send(revisionRequest)
      .expect(200);
    const revised = pregnancyLifecycleResponseSchema.parse(revisedResponse.body);
    expect(revised.dating_date).toBe("2026-04-28");
    expect(lifecycle.revisions).toHaveLength(1);

    const replay = await request(server())
      .patch(`/api/v1/pregnancies/${pregnancyId}`)
      .set("authorization", `Bearer ${token}`)
      .send(revisionRequest)
      .expect(200);
    expect(replay.body).toEqual(revisedResponse.body);
    expect(lifecycle.revisions).toHaveLength(1);

    const closeRequest = {
      idempotency_key: "420b7443-b87c-4728-bbf5-cbe6eff22c59",
      reason: "Kehamilan ditutup secara administratif",
    };
    const closedResponse = await request(server())
      .post(`/api/v1/pregnancies/${pregnancyId}/close`)
      .set("authorization", `Bearer ${token}`)
      .send(closeRequest)
      .expect(200);
    const closed = pregnancyLifecycleResponseSchema.parse(closedResponse.body);
    expect(closed).toMatchObject({ status: "CLOSED", closed_at: now.toISOString() });

    const closeReplay = await request(server())
      .post(`/api/v1/pregnancies/${pregnancyId}/close`)
      .set("authorization", `Bearer ${token}`)
      .send(closeRequest)
      .expect(200);
    expect(closeReplay.body).toEqual(closedResponse.body);

    const revisionReplayAfterClose = await request(server())
      .patch(`/api/v1/pregnancies/${pregnancyId}`)
      .set("authorization", `Bearer ${token}`)
      .send(revisionRequest)
      .expect(200);
    expect(revisionReplayAfterClose.body).toEqual(revisedResponse.body);

    await request(server())
      .patch(`/api/v1/pregnancies/${pregnancyId}`)
      .set("authorization", `Bearer ${token}`)
      .send({
        idempotency_key: "70000000-0000-4000-8000-000000000007",
        pregnancy_start_date: "2026-04-20",
        reason: "Tidak boleh mengubah pregnancy closed",
      })
      .expect(409);

    const createdResponse = await request(server())
      .post(`/api/v1/mothers/${motherId}/pregnancies`)
      .set("authorization", `Bearer ${token}`)
      .send({
        idempotency_key: "0d5e8c8f-0f39-4b4e-87f5-30ac3c0c80bc",
        pregnancy_start_date: "2026-06-01",
      })
      .expect(201);
    expect(pregnancyLifecycleResponseSchema.parse(createdResponse.body).status).toBe("ACTIVE");
    expect(lifecycle.activePregnanciesFor(motherId)).toHaveLength(1);

    await request(server())
      .post(`/api/v1/mothers/${motherId}/pregnancies`)
      .set("authorization", `Bearer ${token}`)
      .send({
        idempotency_key: "70000000-0000-4000-8000-000000000001",
        pregnancy_start_date: "2026-07-01",
      })
      .expect(409);

    const domainAudit = audit.events.filter((event) =>
      ["PREGNANCY_DATING_REVISED", "PREGNANCY_CLOSED", "PREGNANCY_CREATED"].includes(event.action),
    );
    expect(domainAudit.map((event) => event.action)).toEqual([
      "PREGNANCY_DATING_REVISED",
      "PREGNANCY_CLOSED",
      "PREGNANCY_CREATED",
    ]);
  });

  it("fails closed for Bidan, cross-center targets, closed mutations, and an unchanged date", async () => {
    const puskesmasToken = await login("puskesmas");
    await request(server())
      .post(`/api/v1/mothers/${otherMotherId}/pregnancies`)
      .set("authorization", `Bearer ${puskesmasToken}`)
      .send({
        idempotency_key: "70000000-0000-4000-8000-000000000002",
        pregnancy_start_date: "2026-05-01",
      })
      .expect(403);
    await request(server())
      .patch(`/api/v1/pregnancies/${pregnancyId}`)
      .set("authorization", `Bearer ${puskesmasToken}`)
      .send({
        idempotency_key: "70000000-0000-4000-8000-000000000003",
        pregnancy_start_date: "2026-05-01",
        reason: "Tanggal sama",
      })
      .expect(409);

    const bidanToken = await login("bidan");
    await request(server())
      .post(`/api/v1/pregnancies/${pregnancyId}/close`)
      .set("authorization", `Bearer ${bidanToken}`)
      .send({
        idempotency_key: "70000000-0000-4000-8000-000000000004",
        reason: "Tidak diizinkan",
      })
      .expect(403);
    expect(lifecycle.revisions).toHaveLength(0);
  });

  it("rejects future dating and malformed mutation contracts before persistence", async () => {
    const token = await login("puskesmas");
    await request(server())
      .patch(`/api/v1/pregnancies/${pregnancyId}`)
      .set("authorization", `Bearer ${token}`)
      .send({
        idempotency_key: "70000000-0000-4000-8000-000000000005",
        pregnancy_start_date: "2026-08-11",
        reason: "Tanggal masa depan",
      })
      .expect(422);
    await request(server())
      .post(`/api/v1/pregnancies/${pregnancyId}/close`)
      .set("authorization", `Bearer ${token}`)
      .send({
        idempotency_key: "70000000-0000-4000-8000-000000000006",
        reason: "x",
      })
      .expect(400);
    expect(lifecycle.revisions).toHaveLength(0);
    expect(lifecycle.lifecycleEvents).toHaveLength(0);
  });

  async function login(identifier: string): Promise<string> {
    const response = await request(server())
      .post("/api/v1/staff/auth/login")
      .send({ login_identifier: identifier, password })
      .expect(200);
    return stringField(bodyRecord(response), "access_token");
  }

  function server(): Parameters<typeof request>[0] {
    if (app === undefined) throw new Error("Test application is not initialized");
    return app.getHttpServer() as Parameters<typeof request>[0];
  }
});

interface StoredRevision {
  readonly id: string;
  readonly pregnancyId: string;
  readonly response: PregnancyLifecycleResponse;
}

interface StoredLifecycleEvent {
  readonly id: string;
  readonly action: PregnancyLifecycleAction;
  readonly response: PregnancyLifecycleResponse;
}

class FakePregnancyLifecycleRepository implements PregnancyLifecycleRepository {
  public readonly mothers = new Map<string, string>();
  public readonly pregnancies = new Map<string, PregnancyLifecycleResponse>();
  public readonly revisions: StoredRevision[] = [];
  public readonly lifecycleEvents: StoredLifecycleEvent[] = [];

  public seedMother(id: string, healthCenterId: string): void {
    this.mothers.set(id, healthCenterId);
  }

  public seedPregnancy(pregnancy: PregnancyLifecycleResponse): void {
    this.pregnancies.set(pregnancy.id, pregnancy);
  }

  public activePregnanciesFor(targetMotherId: string): readonly PregnancyLifecycleResponse[] {
    return [...this.pregnancies.values()].filter(
      (pregnancy) => pregnancy.mother_id === targetMotherId && pregnancy.status === "ACTIVE",
    );
  }

  public async create(
    client: TransactionClient,
    input: CreatePregnancyInput,
  ): Promise<PregnancyMutationResult> {
    void client;
    if (this.mothers.get(input.motherId) !== input.healthCenterId) {
      throw new PregnancyTargetUnavailableError();
    }
    if (this.activePregnanciesFor(input.motherId).length > 0) {
      throw new ActivePregnancyExistsError();
    }
    const response: PregnancyLifecycleResponse = {
      id: input.pregnancyId,
      mother_id: input.motherId,
      health_center_id: input.healthCenterId,
      dating_basis: "PREGNANCY_START_DATE",
      dating_date: input.pregnancyStartDate,
      status: "ACTIVE",
      closed_at: null,
    };
    this.pregnancies.set(response.id, response);
    this.lifecycleEvents.push({ id: input.lifecycleEventId, action: "CREATED", response });
    return { mutationId: input.lifecycleEventId, pregnancy: response };
  }

  public async reviseDating(
    client: TransactionClient,
    input: RevisePregnancyDatingInput,
  ): Promise<PregnancyMutationResult> {
    void client;
    const existing = this.requirePregnancy(input.pregnancyId, input.healthCenterId);
    if (existing.status !== "ACTIVE") throw new PregnancyNotActiveError();
    if (existing.dating_date === input.pregnancyStartDate) {
      throw new PregnancyDatingUnchangedError();
    }
    const response: PregnancyLifecycleResponse = {
      ...existing,
      dating_date: input.pregnancyStartDate,
    };
    this.pregnancies.set(response.id, response);
    this.revisions.push({ id: input.revisionId, pregnancyId: response.id, response });
    return { mutationId: input.revisionId, pregnancy: response };
  }

  public async close(
    client: TransactionClient,
    input: ClosePregnancyInput,
  ): Promise<PregnancyMutationResult> {
    void client;
    const existing = this.requirePregnancy(input.pregnancyId, input.healthCenterId);
    if (existing.status !== "ACTIVE") throw new PregnancyNotActiveError();
    const response: PregnancyLifecycleResponse = {
      ...existing,
      status: "CLOSED",
      closed_at: input.closedAt.toISOString(),
    };
    this.pregnancies.set(response.id, response);
    this.lifecycleEvents.push({ id: input.lifecycleEventId, action: "CLOSED", response });
    return { mutationId: input.lifecycleEventId, pregnancy: response };
  }

  public async findLifecycleMutation(
    client: TransactionClient,
    lifecycleEventId: string,
    healthCenterId: string,
    action: PregnancyLifecycleAction,
  ): Promise<PregnancyLifecycleResponse | null> {
    void client;
    const event = this.lifecycleEvents.find(
      (candidate) => candidate.id === lifecycleEventId && candidate.action === action,
    );
    return event?.response.health_center_id === healthCenterId ? event.response : null;
  }

  public async findDatingRevisionMutation(
    client: TransactionClient,
    revisionId: string,
    healthCenterId: string,
  ): Promise<PregnancyLifecycleResponse | null> {
    void client;
    const revision = this.revisions.find((candidate) => candidate.id === revisionId);
    return revision?.response.health_center_id === healthCenterId ? revision.response : null;
  }

  private requirePregnancy(id: string, healthCenterId: string): PregnancyLifecycleResponse {
    const pregnancy = this.pregnancies.get(id);
    if (pregnancy === undefined || pregnancy.health_center_id !== healthCenterId) {
      throw new PregnancyTargetUnavailableError();
    }
    return pregnancy;
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
      const value = await replay(client, existing.resource);
      return { ...existing.resource, replayed: true, value };
    }
    const executed = await execute(client);
    const resource = { resourceType: executed.resourceType, resourceId: executed.resourceId };
    this.outcomes.set(key, { resource, identity });
    return { ...resource, replayed: false, value: executed.value };
  }
}

function bodyRecord(response: request.Response): Readonly<Record<string, unknown>> {
  const value: unknown = response.body;
  if (typeof value !== "object" || value === null) throw new Error("Expected object response");
  return value as Readonly<Record<string, unknown>>;
}

function stringField(value: Readonly<Record<string, unknown>>, field: string): string {
  const candidate = value[field];
  if (typeof candidate !== "string") throw new Error(`Expected string field ${field}`);
  return candidate;
}
