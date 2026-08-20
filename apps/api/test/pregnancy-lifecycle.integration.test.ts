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
  type PregnancyCloseMutationResult,
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
const confirmedMilestoneId = "61000000-0000-4000-8000-000000000001";
const upcomingMilestoneId = "61000000-0000-4000-8000-000000000002";
const dueMilestoneId = "61000000-0000-4000-8000-000000000003";
const overdueMilestoneId = "61000000-0000-4000-8000-000000000004";
const cancelledMilestoneId = "61000000-0000-4000-8000-000000000005";
const notApplicableMilestoneId = "61000000-0000-4000-8000-000000000006";
const puskesmasId = "40000000-0000-4000-8000-000000000001";
const bidanId = "40000000-0000-4000-8000-000000000002";
const superAdminId = "40000000-0000-4000-8000-000000000003";
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
    lifecycle.seedMilestone(confirmedMilestoneId, pregnancyId, "CONFIRMED");
    lifecycle.seedMilestone(upcomingMilestoneId, pregnancyId, "UPCOMING");
    lifecycle.seedMilestone(dueMilestoneId, pregnancyId, "DUE");
    lifecycle.seedMilestone(overdueMilestoneId, pregnancyId, "OVERDUE");
    lifecycle.seedMilestone(cancelledMilestoneId, pregnancyId, "CANCELLED");
    lifecycle.seedMilestone(notApplicableMilestoneId, pregnancyId, "NOT_APPLICABLE");
    lifecycle.seedReminderCycle(
      "62000000-0000-4000-8000-000000000001",
      upcomingMilestoneId,
      "PENDING",
    );
    lifecycle.seedReminderCycle(
      "62000000-0000-4000-8000-000000000002",
      dueMilestoneId,
      "WA_ACTION_REQUIRED",
    );
    lifecycle.seedReminderCycle(
      "62000000-0000-4000-8000-000000000003",
      confirmedMilestoneId,
      "PUSH_SUCCEEDED",
    );
    lifecycle.seedReminderCycle(
      "62000000-0000-4000-8000-000000000004",
      cancelledMilestoneId,
      "CANCELLED",
    );
    lifecycle.seedWaAction(
      "63000000-0000-4000-8000-000000000001",
      "62000000-0000-4000-8000-000000000002",
      "READY",
    );

    const passwordHash = await new PasswordHasher().hash(password);
    for (const [id, role, loginIdentifier, hcId] of [
      [puskesmasId, "PUSKESMAS", "puskesmas", centerId],
      [bidanId, "BIDAN", "bidan", centerId],
      [superAdminId, "SUPER_ADMIN", "super_admin", null],
    ] as const) {
      auth.seedUser({
        id,
        healthCenterId: hcId,
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
    expect([...lifecycle.milestones.values()].map((milestone) => milestone.status)).toEqual([
      "CONFIRMED",
      "CANCELLED",
      "CANCELLED",
      "CANCELLED",
      "CANCELLED",
      "NOT_APPLICABLE",
    ]);
    expect([...lifecycle.reminderCycles.values()].map((cycle) => cycle.status)).toEqual([
      "CANCELLED",
      "CANCELLED",
      "PUSH_SUCCEEDED",
      "CANCELLED",
    ]);
    expect([...lifecycle.waActions.values()].map((action) => action.status)).toEqual(["EXPIRED"]);
    expect(lifecycle.cancellationEvents).toHaveLength(5);

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
    expect(domainAudit[1]?.metadata).toMatchObject({
      milestones_cancelled: 3,
      reminder_cycles_cancelled: 2,
      wa_actions_expired: 1,
    });
  });

  it("serializes concurrent close attempts without duplicate cancellation history", async () => {
    const token = await login("puskesmas");
    const responses = await Promise.all([
      request(server())
        .post(`/api/v1/pregnancies/${pregnancyId}/close`)
        .set("authorization", `Bearer ${token}`)
        .send({
          idempotency_key: "70000000-0000-4000-8000-000000000010",
          reason: "Penutupan bersamaan pertama",
        }),
      request(server())
        .post(`/api/v1/pregnancies/${pregnancyId}/close`)
        .set("authorization", `Bearer ${token}`)
        .send({
          idempotency_key: "70000000-0000-4000-8000-000000000011",
          reason: "Penutupan bersamaan kedua",
        }),
    ]);

    expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);
    expect(lifecycle.lifecycleEvents.filter((event) => event.action === "CLOSED")).toHaveLength(1);
    expect(lifecycle.cancellationEvents).toHaveLength(5);
    expect(audit.events.filter((event) => event.action === "PREGNANCY_CLOSED")).toHaveLength(1);
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

    const superAdminToken = await login("super_admin");
    await request(server())
      .post(`/api/v1/pregnancies/${pregnancyId}/close`)
      .set("authorization", `Bearer ${superAdminToken}`)
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

type FakeMilestoneStatus =
  "UPCOMING" | "DUE" | "OVERDUE" | "CONFIRMED" | "CANCELLED" | "NOT_APPLICABLE";

interface FakeMilestone {
  readonly id: string;
  readonly pregnancyId: string;
  status: FakeMilestoneStatus;
}

type FakeReminderCycleStatus =
  | "PENDING"
  | "PUSH_ATTEMPTING"
  | "PUSH_SUCCEEDED"
  | "WA_ACTION_REQUIRED"
  | "MANUAL_FOLLOWUP"
  | "ESCALATED"
  | "CANCELLED";

interface FakeReminderCycle {
  readonly id: string;
  readonly milestoneId: string;
  status: FakeReminderCycleStatus;
}

interface FakeWaAction {
  readonly id: string;
  readonly reminderCycleId: string;
  status: "READY" | "LINK_GENERATED" | "LINK_OPENED" | "EXPIRED";
}

interface FakeCancellationEvent {
  readonly lifecycleEventId: string;
  readonly target: "MILESTONE" | "REMINDER_CYCLE";
  readonly resourceId: string;
  readonly previousStatus: string;
}

class FakePregnancyLifecycleRepository implements PregnancyLifecycleRepository {
  public readonly mothers = new Map<string, string>();
  public readonly pregnancies = new Map<string, PregnancyLifecycleResponse>();
  public readonly revisions: StoredRevision[] = [];
  public readonly lifecycleEvents: StoredLifecycleEvent[] = [];
  public readonly milestones = new Map<string, FakeMilestone>();
  public readonly reminderCycles = new Map<string, FakeReminderCycle>();
  public readonly waActions = new Map<string, FakeWaAction>();
  public readonly cancellationEvents: FakeCancellationEvent[] = [];

  public seedMother(id: string, healthCenterId: string): void {
    this.mothers.set(id, healthCenterId);
  }

  public seedPregnancy(pregnancy: PregnancyLifecycleResponse): void {
    this.pregnancies.set(pregnancy.id, pregnancy);
  }

  public seedMilestone(id: string, targetPregnancyId: string, status: FakeMilestoneStatus): void {
    this.milestones.set(id, { id, pregnancyId: targetPregnancyId, status });
  }

  public seedReminderCycle(id: string, milestoneId: string, status: FakeReminderCycleStatus): void {
    this.reminderCycles.set(id, { id, milestoneId, status });
  }

  public seedWaAction(id: string, reminderCycleId: string, status: FakeWaAction["status"]): void {
    this.waActions.set(id, { id, reminderCycleId, status });
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
  ): Promise<PregnancyCloseMutationResult> {
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

    let reminderCyclesCancelled = 0;
    for (const cycle of this.reminderCycles.values()) {
      const milestone = this.milestones.get(cycle.milestoneId);
      if (
        milestone?.pregnancyId === input.pregnancyId &&
        [
          "PENDING",
          "PUSH_ATTEMPTING",
          "WA_ACTION_REQUIRED",
          "MANUAL_FOLLOWUP",
          "ESCALATED",
        ].includes(cycle.status)
      ) {
        const previousStatus = cycle.status;
        cycle.status = "CANCELLED";
        reminderCyclesCancelled += 1;
        this.cancellationEvents.push({
          lifecycleEventId: input.lifecycleEventId,
          target: "REMINDER_CYCLE",
          resourceId: cycle.id,
          previousStatus,
        });
      }
    }

    let waActionsExpired = 0;
    for (const action of this.waActions.values()) {
      const cycle = this.reminderCycles.get(action.reminderCycleId);
      if (cycle?.status === "CANCELLED" && action.status !== "EXPIRED") {
        action.status = "EXPIRED";
        waActionsExpired += 1;
      }
    }

    let milestonesCancelled = 0;
    for (const milestone of this.milestones.values()) {
      if (
        milestone.pregnancyId === input.pregnancyId &&
        ["UPCOMING", "DUE", "OVERDUE"].includes(milestone.status)
      ) {
        const previousStatus = milestone.status;
        milestone.status = "CANCELLED";
        milestonesCancelled += 1;
        this.cancellationEvents.push({
          lifecycleEventId: input.lifecycleEventId,
          target: "MILESTONE",
          resourceId: milestone.id,
          previousStatus,
        });
      }
    }

    return {
      mutationId: input.lifecycleEventId,
      pregnancy: response,
      cancellation: { milestonesCancelled, reminderCyclesCancelled, waActionsExpired },
    };
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
